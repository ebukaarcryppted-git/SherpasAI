import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@support-agent-asp/agent-core";
import { payAndDiagnose } from "@/lib/payments/mppClient";
import { checkRateLimit, getClientIp, rateLimitResponseInit } from "@/lib/rateLimit";

/**
 * The widget's backend proxy (spec: "Payment Phase" section 3). Holds the
 * embedding protocol's funded wallet key server-side and pays the
 * pay-as-you-go gated MCP server on the widget's behalf — the end user's
 * browser never touches payment, and the private key never reaches
 * client-side code. Point a deployed widget's `mcpEndpoint` prop at this
 * route instead of directly at the gated MCP server.
 *
 * This route spends real funds from DIAGNOSIS_PAYER_PRIVATE_KEY on every
 * accepted request and has no other authentication of its own — the rate
 * limit below is the only thing standing between "visitor uses the support
 * widget" (intended) and "anyone who finds this URL drains the wallet"
 * (not intended). Tune DIAGNOSE_PROXY_RATE_LIMIT_PER_MINUTE down further if
 * your actual expected traffic is lower than this default.
 *
 * Required env vars: DIAGNOSIS_PAYER_PRIVATE_KEY, MPP_CURRENCY, MPP_RECIPIENT,
 * MCP_SERVER_URL. See website/.env.example.
 */
const RATE_LIMIT_PER_MINUTE = Number(process.env.DIAGNOSE_PROXY_RATE_LIMIT_PER_MINUTE ?? 5);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`diagnose-proxy:${ip}`, RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Too many requests — please wait a moment and try again." },
        id: null,
      },
      rateLimitResponseInit(rateLimit)
    );
  }

  const mcpServerUrl = process.env.MCP_SERVER_URL;
  if (!mcpServerUrl) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "MCP_SERVER_URL not configured" }, id: null },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Invalid JSON" }, id: null },
      { status: 400 }
    );
  }

  try {
    const result = await payAndDiagnose(mcpServerUrl, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = safeErrorMessage(err, "Payment failed.", "/api/diagnose-proxy failed:");
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: body?.id ?? null },
      { status: 502 }
    );
  }
}
