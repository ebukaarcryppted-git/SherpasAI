import { NextRequest, NextResponse } from "next/server";
import { diagnoseBridge, safeErrorMessage, X_LAYER_MAINNET_ID, ETHEREUM_MAINNET_ID } from "@support-agent-asp/agent-core";
import { isAddress, isHash, type Hash, type Hex } from "viem";
import { checkRateLimit, getClientIp, rateLimitResponseInit } from "@/lib/rateLimit";

const RATE_LIMIT_PER_MINUTE = 10;

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(`bridge:${getClientIp(req)}`, RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment and try again." },
      rateLimitResponseInit(rateLimit)
    );
  }

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

  // Fail fast on malformed input, before any RPC call — same principle as
  // diagnoseTransaction's isHash guard. Without this, a garbled hash or
  // address sent straight to the chain reads just times out slowly instead
  // of erroring immediately.
  if (!isHash(hash)) {
    return NextResponse.json(
      { error: `'${hash}' isn't a valid transaction hash — it should be a 66-character hex string starting with 0x.` },
      { status: 400 }
    );
  }
  if (!isAddress(recipient)) {
    return NextResponse.json(
      { error: `'${recipient}' isn't a valid recipient address — double-check for typos or a dropped character.` },
      { status: 400 }
    );
  }

  try {
    const diagnosis = await diagnoseBridge(sourceChainId, destinationChainId, hash, recipient);
    return NextResponse.json(diagnosis);
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, "Bridge check failed.", "/api/bridge failed:") },
      { status: 502 }
    );
  }
}
