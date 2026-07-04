/**
 * Mirrors agent-core's classify.ts output shape — duplicated, not imported,
 * because this widget ships as a standalone npm package that talks to the
 * MCP server over HTTP, not to the monorepo's internal packages directly.
 * If classify.ts's mode list changes, this needs a matching update.
 */
export type ClassifiedMode =
  | "WRONG_NETWORK"
  | "NONCE_ALREADY_USED"
  | "NONCE_GAP"
  | "GAS_UNDERPRICED"
  | "SLIPPAGE_REVERT"
  | "INSUFFICIENT_ALLOWANCE"
  | "BRIDGE_SOURCE_NOT_CONFIRMED"
  | "BRIDGE_WITHIN_NORMAL_WINDOW"
  | "BRIDGE_STUCK"
  | "NOT_A_FAILURE"
  | "UNKNOWN_PENDING"
  | "INSUFFICIENT_BALANCE";

export interface QuantifiedSlippage {
  path: string[];
  amountIn: string;
  amountOutMin: string;
  expectedOutAtReference: string;
  actualOutAtExecution: string;
  priceMovementPercent: number;
  slippageTolerancePercent: number;
}

export type BridgeSubMode =
  | "NEEDS_MANUAL_CLAIM"
  | "SILENTLY_FAILED_ON_DESTINATION"
  | "RELAYER_DELAY"
  | "INSUFFICIENT_DEST_GAS"
  | "UNKNOWN";

export interface BridgeDeepDiveResult {
  subMode: BridgeSubMode;
  confidence: number;
  note: string;
  evidence: Record<string, unknown>;
}

export interface Diagnosis {
  mode: ClassifiedMode;
  confidence: number;
  evidence: Record<string, unknown>;
  ruleTriggered: string;
  healthy?: boolean;
  quantifiedSlippage?: QuantifiedSlippage;
  bridgeDeepDive?: BridgeDeepDiveResult;
}

/** Confidence bands the UI hedges its language around — see design spec section 6. */
export type ConfidenceBand = "high" | "medium" | "low";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
