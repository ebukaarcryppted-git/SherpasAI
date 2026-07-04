import { NextRequest, NextResponse } from "next/server";
import { getWalletSummary, X_LAYER_MAINNET_ID } from "@support-agent-asp/agent-core";
import type { Hex } from "viem";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const address = typeof body?.address === "string" ? (body.address as Hex) : null;
  const tokens = Array.isArray(body?.tokens) ? (body.tokens as Hex[]) : [];
  const chainId = typeof body?.chainId === "number" ? body.chainId : X_LAYER_MAINNET_ID;

  if (!address) {
    return NextResponse.json({ error: "Missing 'address' in request body." }, { status: 400 });
  }

  try {
    const overview = await getWalletSummary(chainId, address, tokens);
    return NextResponse.json({
      ...overview,
      nativeBalance: overview.nativeBalance.toString(),
      tokens: overview.tokens.map((t) => ({ ...t, raw: t.raw.toString() })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wallet read failed." },
      { status: 502 }
    );
  }
}
