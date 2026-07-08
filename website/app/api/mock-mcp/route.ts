import { NextRequest, NextResponse } from "next/server";

/**
 * Demo-only mock of the diagnose_transaction MCP tool, for visually
 * verifying every SupportWidget card/state in a browser without needing a
 * real wallet or a live sherpas-support-mcp-server. Returns a canned
 * Diagnosis keyed off magic test hashes — never used outside /widget-demo.
 *
 * Gated the same way as /widget-demo (which is the only real caller): a
 * production deployment serves 404 here by default, since this returns
 * fabricated diagnoses and has no business being reachable once real users
 * are hitting the site. Opt in with DEMO_ROUTES_ENABLED=true if needed.
 */
function demoRoutesDisabled(): boolean {
  return process.env.NODE_ENV === "production" && process.env.DEMO_ROUTES_ENABLED !== "true";
}

const FIXTURES: Record<string, unknown> = {
  "0x000000000000000000000000000000000000000000000000000000000000c001": {
    mode: "NOT_A_FAILURE",
    confidence: 1,
    evidence: { blockNumber: 64253477, gasUsed: "52558" },
    ruleTriggered: "diagnoseLive:successNoRuleMatched",
    healthy: true,
  },
  "0x000000000000000000000000000000000000000000000000000000000000c002": {
    mode: "WRONG_NETWORK",
    confidence: 0.95,
    evidence: { connected: 1, expected: 196 },
    ruleTriggered: "wrongNetwork:dappContextMismatch",
  },
  "0x000000000000000000000000000000000000000000000000000000000000c003": {
    mode: "NONCE_GAP",
    confidence: 0.9,
    evidence: { note: "missing tx at nonce 12; this one is queued behind it", txNonce: 15, pendingNonce: 12, blockNumber: 64200000 },
    ruleTriggered: "nonce:gap",
  },
  "0x000000000000000000000000000000000000000000000000000000000000c004": {
    mode: "NONCE_ALREADY_USED",
    confidence: 0.95,
    evidence: { note: "a different tx already used nonce 8", txNonce: 8, confirmedNonce: 10 },
    ruleTriggered: "nonce:alreadyUsed",
  },
  "0x000000000000000000000000000000000000000000000000000000000000c005": {
    mode: "GAS_UNDERPRICED",
    confidence: 0.9,
    evidence: { txFee: "500000000", currentGasPrice: "1000000000", blockNumber: 64253000 },
    ruleTriggered: "gas:belowCurrentBaseFee",
  },
  "0x000000000000000000000000000000000000000000000000000000000000c006": {
    mode: "SLIPPAGE_REVERT",
    confidence: 0.95,
    evidence: { revertReason: "Too little received", blockNumber: 64253100 },
    ruleTriggered: "slippage:decodedReason",
    quantifiedSlippage: {
      path: ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
      amountIn: "1000000000000000000",
      amountOutMin: "950000000000000000",
      expectedOutAtReference: "1000000000000000000",
      actualOutAtExecution: "900000000000000000",
      priceMovementPercent: 10,
      slippageTolerancePercent: 5,
    },
  },
  "0x000000000000000000000000000000000000000000000000000000000000c007": {
    mode: "INSUFFICIENT_ALLOWANCE",
    confidence: 0.9,
    evidence: { allowance: "50", required: "100", blockNumber: 64253200 },
    ruleTriggered: "allowance:inferredFromState",
  },
  "0x000000000000000000000000000000000000000000000000000000000000c008": {
    mode: "BRIDGE_STUCK",
    confidence: 0.7,
    evidence: { elapsedSeconds: 4200, expectedTimeSeconds: 900 },
    ruleTriggered: "bridge:exceededWindow",
    bridgeDeepDive: {
      subMode: "NEEDS_MANUAL_CLAIM",
      confidence: 0.85,
      note: "Past X Layer's documented 7-day fraud-proof challenge period with no L1 transaction found. The canonical bridge requires a manual claim/finalize transaction on Ethereum after this window.",
      evidence: {},
    },
  },
  "0x000000000000000000000000000000000000000000000000000000000000c009": {
    mode: "UNKNOWN_PENDING",
    confidence: 0.15,
    evidence: { note: "nonce and gas both look correct — likely temporary network congestion" },
    ruleTriggered: "gas:fallbackUnknownPending",
  },
};

export async function POST(req: NextRequest) {
  if (demoRoutesDisabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const txHash: string | undefined = body?.params?.arguments?.txHash;
  const id = body?.id ?? null;

  await new Promise((resolve) => setTimeout(resolve, 1400)); // simulate real RPC latency for the staged-loading UI

  const diagnosis = txHash ? FIXTURES[txHash.toLowerCase()] : undefined;

  if (!diagnosis) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: "Unknown fixture hash — see /widget-demo for the list of test hashes." }],
        isError: true,
      },
    });
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(diagnosis) }],
      structuredContent: diagnosis,
    },
  });
}
