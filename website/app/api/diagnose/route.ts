import { NextRequest, NextResponse } from "next/server";
import { diagnoseTransaction } from "@support-agent-asp/agent-core";

export async function POST(req: NextRequest) {
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
      { error: err instanceof Error ? err.message : "Diagnosis failed." },
      { status: 502 }
    );
  }
}
