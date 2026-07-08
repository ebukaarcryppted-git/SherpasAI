import { NextRequest, NextResponse } from "next/server";
import { diagnoseTransaction, safeErrorMessage } from "@support-agent-asp/agent-core";
import { checkRateLimit, getClientIp, rateLimitResponseInit } from "@/lib/rateLimit";

const RATE_LIMIT_PER_MINUTE = 20;

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(`diagnose:${getClientIp(req)}`, RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment and try again." },
      rateLimitResponseInit(rateLimit)
    );
  }

  const body = await req.json().catch(() => null);
  const hash = typeof body?.hash === "string" ? body.hash : null;

  if (!hash) {
    return NextResponse.json({ error: "Missing 'hash' in request body." }, { status: 400 });
  }

  try {
    const diagnosis = await diagnoseTransaction(hash);
    return NextResponse.json(diagnosis);
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, "Diagnosis failed.", "/api/diagnose failed:") },
      { status: 502 }
    );
  }
}
