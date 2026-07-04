export * from "./types.js";
export { diagnoseTransaction } from "./diagnoseTransaction.js";
export { diagnoseApprovals, type ApprovalReport } from "./diagnoseApprovals.js";
export { diagnoseBridge } from "./diagnoseBridge.js";
export { getWalletSummary } from "./walletOverview.js";

// Phase 1 pure rule-based classifier (spec: Phase 1 Diagnosis Engine doc).
// Namespaced to avoid colliding with the live-RPC Diagnosis/FailureMode
// types above — `classify.diagnose(...)`, `classify.DiagnosisInput`, etc.
export * as classify from "./classify.js";

// Phase 2: builds classify.ts's input from real onchain-reader calls, plus
// live-only enrichments (quantified slippage, bridge root-causing).
// `live.diagnoseLive(...)` is the main entry point.
export * as live from "./live/index.js";

// Re-export the chain constants callers need to pick a chainId without
// depending on onchain-reader directly.
export {
  X_LAYER_MAINNET_ID,
  X_LAYER_TESTNET_ID,
  ETHEREUM_MAINNET_ID,
} from "@support-agent-asp/onchain-reader";
