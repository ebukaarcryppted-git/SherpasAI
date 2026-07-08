import { NextRequest, NextResponse } from "next/server";
import { getWalletSummary, safeErrorMessage, X_LAYER_MAINNET_ID } from "@support-agent-asp/agent-core";
import { isAddress, type Hex } from "viem";
import { checkRateLimit, getClientIp, rateLimitResponseInit } from "@/lib/rateLimit";

const RATE_LIMIT_PER_MINUTE = 10;

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(`wallet:${getClientIp(req)}`, RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment and try again." },
      rateLimitResponseInit(rateLimit)
    );
  }

  const body = await req.json().catch(() => null);
  const address = typeof body?.address === "string" ? (body.address as Hex) : null;
  const tokens = Array.isArray(body?.tokens) ? (body.tokens as Hex[]) : [];
  const chainId = typeof body?.chainId === "number" ? body.chainId : X_LAYER_MAINNET_ID;

  if (!address) {
    return NextResponse.json({ error: "Missing 'address' in request body." }, { status: 400 });
  }
  if (!isAddress(address)) {
    return NextResponse.json(
      { error: `'${address}' isn't a valid wallet address — double-check for typos or a dropped character.` },
      { status: 400 }
    );
  }
  const badToken = tokens.find((t) => !isAddress(t));
  if (badToken) {
    return NextResponse.json(
      { error: `'${badToken}' isn't a valid token address — double-check for typos or a dropped character.` },
      { status: 400 }
    );
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
      { error: safeErrorMessage(err, "Wallet read failed.", "/api/wallet failed:") },
      { status: 502 }
    );
  }
}
