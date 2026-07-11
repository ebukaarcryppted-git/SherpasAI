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
 * limit and the diagnose_transaction shape check below are the only things
 * standing between "visitor uses the support widget" (intended) and
 * "anyone who finds this URL drains the wallet" (not intended). Tune
 * DIAGNOSE_PROXY_RATE_LIMIT_PER_MINUTE down further if your actual expected
 * traffic is lower than this default.
 *
 * Required env vars: DIAGNOSIS_PAYER_PRIVATE_KEY, MPP_CURRENCY, MPP_RECIPIENT,
 * MCP_SERVER_URL. See website/.env.example.
 */
const RATE_LIMIT_PER_MINUTE = Number(process.env.DIAGNOSE_PROXY_RATE_LIMIT_PER_MINUTE ?? 5);

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

/**
 * This route pays real funds for every request it forwards, so it must not
 * pay for anything other than a well-formed diagnose_transaction call — a
 * caller sending an arbitrary/garbage body would otherwise still get
 * charged, since the payment gate on the other end charges per accepted
 * request, not per successful diagnosis. Mirrors DiagnoseInputSchema in
 * sherpas-support-mcp-server/src/tools/diagnose.ts.
 */
function isValidDiagnoseRequest(body: unknown): body is {
  id?: unknown;
  method: "tools/call";
  params: { name: "diagnose_transaction"; arguments: { txHash: string; chainId: number; expectedChainId?: number } };
} {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (b.method !== "tools/call") return false;

  const params = b.params as Record<string, unknown> | undefined;
  if (!params || params.name !== "diagnose_transaction") return false;

  const args = params.arguments as Record<string, unknown> | undefined;
  if (!args || typeof args.txHash !== "string" || !TX_HASH_RE.test(args.txHash)) return false;
  if (typeof args.chainId !== "number" || !Number.isInteger(args.chainId) || args.chainId <= 0) return false;
  if (args.expectedChainId !== undefined) {
    if (typeof args.expectedChainId !== "number" || !Number.isInteger(args.expectedChainId) || args.expectedChainId <= 0) {
      return false;
    }
  }
  return true;
}

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

  if (!isValidDiagnoseRequest(body)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32602, message: "Request must be a tools/call for diagnose_transaction with a valid txHash and chainId." },
        id: (body as { id?: unknown } | null)?.id ?? null,
      },
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
