import { NextRequest, NextResponse } from "next/server";
import { payAndDiagnose } from "@/lib/payments/mppClient";

/**
 * The widget's backend proxy (spec: "Payment Phase" section 3). Holds the
 * embedding protocol's funded wallet key server-side and pays the
 * pay-as-you-go gated MCP server on the widget's behalf — the end user's
 * browser never touches payment, and the private key never reaches
 * client-side code. Point a deployed widget's `mcpEndpoint` prop at this
 * route instead of directly at the gated MCP server.
 *
 * Required env vars: DIAGNOSIS_PAYER_PRIVATE_KEY, MPP_CURRENCY, MPP_RECIPIENT,
 * MCP_SERVER_URL. See website/.env.example.
 */
export async function POST(req: NextRequest) {
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
    console.error("diagnose-proxy payment failed:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : "Payment failed" },
        id: body?.id ?? null,
      },
      { status: 502 }
    );
  }
}
