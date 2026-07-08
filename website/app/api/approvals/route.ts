import { NextRequest, NextResponse } from "next/server";
import { diagnoseApprovals, safeErrorMessage, X_LAYER_MAINNET_ID } from "@support-agent-asp/agent-core";
import { isAddress, type Hex } from "viem";
import { checkRateLimit, getClientIp, rateLimitResponseInit } from "@/lib/rateLimit";

const RATE_LIMIT_PER_MINUTE = 10; // scans multiple RPC calls per request — tighter than the plain diagnose route

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(`approvals:${getClientIp(req)}`, RATE_LIMIT_PER_MINUTE);
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
  if (tokens.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one token address in 'tokens' to scan." },
      { status: 400 }
    );
  }

  // Fail fast on malformed addresses, before any RPC call — a garbled
  // wallet or token address sent straight to eth_getLogs doesn't error
  // quickly, it just scans and comes back empty after the RPC's full
  // timeout/retry budget (confirmed live: 30s+ for a single bad address).
  // Same principle as diagnoseTransaction's isHash guard.
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
    const report = await diagnoseApprovals(chainId, address, tokens);
    return NextResponse.json({
      ...report,
      findings: report.findings.map((f) => ({ ...f, allowance: f.allowance.toString() })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, "Approval scan failed.", "/api/approvals failed:") },
      { status: 502 }
    );
  }
}
