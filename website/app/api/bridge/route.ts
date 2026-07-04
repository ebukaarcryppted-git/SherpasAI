import { NextRequest, NextResponse } from "next/server";
import { diagnoseBridge, X_LAYER_MAINNET_ID, ETHEREUM_MAINNET_ID } from "@support-agent-asp/agent-core";
import type { Hash, Hex } from "viem";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const hash = typeof body?.hash === "string" ? (body.hash as Hash) : null;
  const recipient = typeof body?.recipient === "string" ? (body.recipient as Hex) : null;
  const sourceChainId = typeof body?.sourceChainId === "number" ? body.sourceChainId : ETHEREUM_MAINNET_ID;
  const destinationChainId =
    typeof body?.destinationChainId === "number" ? body.destinationChainId : X_LAYER_MAINNET_ID;

  if (!hash || !recipient) {
    return NextResponse.json(
      { error: "Missing 'hash' and/or 'recipient' in request body." },
      { status: 400 }
    );
  }

  try {
    const diagnosis = await diagnoseBridge(sourceChainId, destinationChainId, hash, recipient);
    return NextResponse.json(diagnosis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bridge check failed." },
      { status: 502 }
    );
  }
}
