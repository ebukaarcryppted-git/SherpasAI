import { NextRequest, NextResponse } from "next/server";
import { diagnoseApprovals, X_LAYER_MAINNET_ID } from "@support-agent-asp/agent-core";
import type { Hex } from "viem";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const address = typeof body?.address === "string" ? (body.address as Hex) : null;
  const tokens = Array.isArray(body?.tokens) ? (body.tokens as Hex[]) : [];
  const chainId = typeof body?.chainId === "number" ? body.chainId : X_LAYER_MAINNET_ID;

  if (!address) {
    return NextResponse.json({ error: "Missing 'address' in request body." }, { status: 400 });
  }
  if (tokens.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one token address in 'tokens' to scan." },
      { status: 400 }
    );
  }

  try {
    const report = await diagnoseApprovals(chainId, address, tokens);
    return NextResponse.json({
      ...report,
      findings: report.findings.map((f) => ({ ...f, allowance: f.allowance.toString() })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approval scan failed." },
      { status: 502 }
    );
  }
}
