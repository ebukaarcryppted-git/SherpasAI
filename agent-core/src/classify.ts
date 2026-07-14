import { decodeAbiParameters, isHex, type Hex } from "viem";

/**
 * Phase 1 rule-based classifier — spec'd in the Phase 1 Diagnosis Engine doc.
 * Pure and RPC-free: operates entirely on a pre-assembled DiagnosisInput so
 * it can be unit-tested against /demo fixtures before Phase 2 wires in live
 * OnchainOS reads. Do not add network calls to this file.
 */

// ---------------------------------------------------------------------------
// 1. Input schema
// ---------------------------------------------------------------------------

export interface DiagnosisInput {
  tx: {
    hash: string;
    chainId: number;
    status: "success" | "reverted" | "pending" | "not_found";
    from: string;
    to: string; // contract called
    functionSelector: string; // e.g. 0x38ed1739 (swapExactTokensForTokens)
    nonce: number;
    maxFeePerGas?: bigint; // EIP-1559
    gasPrice?: bigint; // legacy
    gasUsed?: bigint;
    revertData?: string; // raw hex, e.g. 0x08c379a0...
    blockNumber?: number;
    submittedAt: number; // unix ts
  };
  wallet: {
    address: string;
    connectedChainId: number; // what the wallet is currently on
    confirmedNonce: number; // eth_getTransactionCount(latest)
    pendingNonce: number; // eth_getTransactionCount(pending)
    tokenAllowance?: bigint; // for the token+spender involved, if relevant
    tokenBalance?: bigint;
  };
  dappContext?: {
    expectedChainId: number; // passed by the embedding widget
    requiredAllowance?: bigint;
  };
  networkState: {
    currentBaseFee: bigint;
    baseFeeAtSubmission?: bigint;
  };
  bridge?: {
    protocol: string;
    sourceTxConfirmed: boolean;
    sourceFinalizedAt?: number;
    destTxFound: boolean;
    expectedTimeSeconds: number; // protocol-specific SLA
  };
}

// ---------------------------------------------------------------------------
// 4. Output schema
// ---------------------------------------------------------------------------

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
  | "INSUFFICIENT_BALANCE"
  | "REVERTED_OTHER";

/**
 * Attached to any diagnosis by the pipeline caller (buildDiagnosisInput +
 * diagnoseLive) when the chain the tx was actually resolved on differs
 * from `dappContext.expectedChainId`. Informational: augments the primary
 * diagnosis rather than replacing it (Phase 1 spec §2a). classify.ts
 * itself never populates this — chain resolution isn't part of the pure
 * rules, it's an input-building step.
 */
export interface NetworkNote {
  foundOn: number;
  expected: number;
  message: string;
}

export interface Diagnosis {
  mode: ClassifiedMode;
  confidence: number; // 0-1
  evidence: Record<string, unknown>;
  ruleTriggered: string; // which branch fired, for debugging/demo transparency
  /**
   * Optional network-mismatch note (Phase 1 spec §2a). Populated by the
   * pipeline caller when `dappContext.expectedChainId` doesn't match the
   * resolved chain — informational only, doesn't affect `mode` or
   * `confidence`.
   */
  networkNote?: NetworkNote;
}

/**
 * Dependencies the classifier can be handed for the wrong-network fallback
 * path (section 3.1). Phase 1 stays RPC-free: this is an injection point so
 * Phase 2 can supply a real "search a small hardcoded chain list" lookup
 * without changing any classification logic here. Pure unit tests inject a
 * canned function; production code (once Phase 2 lands) would inject one
 * backed by onchain-reader.
 */
export interface ClassifyDeps {
  /** Looks up which chain id (if any) this hash resolves on. Returns null if not found anywhere checked. */
  crossChainLookup?: (hash: string) => number | null;
}

// ---------------------------------------------------------------------------
// Revert-data decoding (standard `Error(string)` ABI encoding, selector 0x08c379a0)
// ---------------------------------------------------------------------------

const ERROR_STRING_SELECTOR = "0x08c379a0";

/** Decodes a standard Error(string) revert. Returns undefined for custom errors or malformed data — those need per-contract ABI decoding this pure classifier doesn't have. */
function decodeRevertReason(revertData?: string): string | undefined {
  if (!revertData || !isHex(revertData)) return undefined;
  if (!revertData.toLowerCase().startsWith(ERROR_STRING_SELECTOR)) return undefined;

  try {
    const paramData = `0x${revertData.slice(10)}` as Hex;
    const [reason] = decodeAbiParameters([{ type: "string" }], paramData);
    return reason;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 6. Verified slippage signature reference — do not add entries beyond what's
// confirmed in the Phase 1 spec's section 6 without also adding a TODO.
// ---------------------------------------------------------------------------

/**
 * Matched by suffix, not full string — every UniswapV2 fork (Pancake, Sushi,
 * QuickSwap, etc.) keeps the same require-string suffix and only swaps the
 * "X Router: " prefix, so one rule covers every fork.
 */
const SLIPPAGE_REVERT_SUFFIXES = ["INSUFFICIENT_OUTPUT_AMOUNT", "EXCESSIVE_INPUT_AMOUNT"];

/** Uniswap V3 string reverts — matched exactly, no prefix variation to worry about. */
const SLIPPAGE_REVERT_EXACT = ["Too little received", "Too much requested"];

/**
 * Standard 4-byte selectors, stable across all deployments (derived purely
 * from the function signature). Verified against section 6's table.
 */
const SWAP_FUNCTION_SELECTORS = new Set<string>([
  "0x38ed1739", // swapExactTokensForTokens(uint,uint,address[],address,uint)
  "0x7ff36ab5", // swapExactETHForTokens(uint,address[],address,uint)
  "0x18cbafe5", // swapExactTokensForETH(uint,uint,address[],address,uint)
  "0x8803dbee", // swapTokensForExactTokens(uint,uint,address[],address,uint)
  "0x414bf389", // exactInputSingle (Uniswap V3)
  "0xc04b8d59", // exactInput (Uniswap V3)
  "0xdb3e2198", // exactOutputSingle (Uniswap V3)
  // TODO: exactOutput (Uniswap V3, plain multi-hop exact-output) selector is
  // not in the verified reference table (spec section 6) — add once confirmed
  // against the actual ABI rather than guessed.
]);

// Allowance revert strings/errors, as listed in spec section 3.5. The two
// Permit2 entries are custom-error *names* (not independently selector-
// verified the way section 6 verified the slippage table) — matching here
// assumes the caller's revert data already decodes to these names. See spec
// section 6's note: confirm Permit2 selector encoding against its ABI
// directly before relying on this in a live (non-fixture) path.
const ALLOWANCE_REVERT_STRINGS = ["ERC20: transfer amount exceeds allowance", "TRANSFER_FROM_FAILED"];
// TODO: Permit2 custom-error selectors (AllowanceExpired, InsufficientAllowance)
// are not verified against the Permit2 ABI — confirm before trusting in Phase 2.
const ALLOWANCE_PERMIT2_ERROR_NAMES = ["AllowanceExpired", "InsufficientAllowance"];

// ---------------------------------------------------------------------------
// 3.1 Wrong network
// ---------------------------------------------------------------------------

function classifyWrongNetwork(input: DiagnosisInput, deps?: ClassifyDeps): Diagnosis | null {
  if (input.dappContext?.expectedChainId !== undefined) {
    if (input.wallet.connectedChainId !== input.dappContext.expectedChainId) {
      return {
        mode: "WRONG_NETWORK",
        confidence: 0.95,
        evidence: {
          connected: input.wallet.connectedChainId,
          expected: input.dappContext.expectedChainId,
        },
        ruleTriggered: "wrongNetwork:dappContextMismatch",
      };
    }
    return null; // dappContext present and chains match — not this mode
  }

  // Fallback: no dappContext, only a tx hash — re-query a small hardcoded
  // chain list (injected via deps; Phase 1 itself never calls out to RPC).
  if (input.tx.status === "not_found") {
    const foundOnChainId = deps?.crossChainLookup?.(input.tx.hash) ?? null;
    if (foundOnChainId !== null && foundOnChainId !== input.tx.chainId) {
      return {
        mode: "WRONG_NETWORK",
        confidence: 0.7,
        evidence: { foundOnChainId, expectedChainId: input.tx.chainId },
        ruleTriggered: "wrongNetwork:crossChainFallback",
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3.2 Nonce issue
// ---------------------------------------------------------------------------

function classifyNonceIssue(input: DiagnosisInput): Diagnosis | null {
  if (input.tx.status !== "pending" && input.tx.status !== "not_found") return null;

  if (input.tx.nonce < input.wallet.confirmedNonce) {
    return {
      mode: "NONCE_ALREADY_USED",
      confidence: 0.95,
      evidence: {
        note: `a different tx already used nonce ${input.tx.nonce}`,
        txNonce: input.tx.nonce,
        confirmedNonce: input.wallet.confirmedNonce,
      },
      ruleTriggered: "nonce:alreadyUsed",
    };
  }

  if (input.tx.nonce > input.wallet.pendingNonce) {
    return {
      mode: "NONCE_GAP",
      confidence: 0.9,
      evidence: {
        note: `missing tx at nonce ${input.wallet.pendingNonce}; this one is queued behind it`,
        txNonce: input.tx.nonce,
        pendingNonce: input.wallet.pendingNonce,
      },
      ruleTriggered: "nonce:gap",
    };
  }

  // nonce is correctly next-in-line — not a nonce issue, fall through to gas check
  return null;
}

// ---------------------------------------------------------------------------
// 3.3 Gas too low / underpriced
// ---------------------------------------------------------------------------

function classifyGasUnderpriced(input: DiagnosisInput): Diagnosis | null {
  // Only reached once nonce has fallen through, and only meaningful while
  // the tx is still pending (per spec's trigger condition).
  if (input.tx.status !== "pending") return null;

  const effectiveFee = input.tx.maxFeePerGas ?? input.tx.gasPrice;
  if (effectiveFee === undefined) return null;

  if (effectiveFee < input.networkState.currentBaseFee) {
    return {
      mode: "GAS_UNDERPRICED",
      confidence: 0.9,
      evidence: { txFee: effectiveFee, currentBaseFee: input.networkState.currentBaseFee },
      ruleTriggered: "gas:belowCurrentBaseFee",
    };
  }

  if (
    input.networkState.baseFeeAtSubmission !== undefined &&
    effectiveFee < (input.networkState.baseFeeAtSubmission * BigInt(105)) / BigInt(100)
  ) {
    return {
      mode: "GAS_UNDERPRICED",
      confidence: 0.75,
      evidence: {
        note: "fee was borderline at submission and has since fallen behind",
        txFee: effectiveFee,
        baseFeeAtSubmission: input.networkState.baseFeeAtSubmission,
      },
      ruleTriggered: "gas:borderlineAtSubmission",
    };
  }

  return {
    mode: "UNKNOWN_PENDING",
    confidence: 0.3,
    evidence: { note: "nonce and gas both look correct — likely temporary network congestion" },
    ruleTriggered: "gas:fallbackUnknownPending",
  };
}

// ---------------------------------------------------------------------------
// 3.4 Slippage revert
// ---------------------------------------------------------------------------

function classifySlippageRevert(input: DiagnosisInput): Diagnosis | null {
  if (input.tx.status !== "reverted") return null;

  const decoded = decodeRevertReason(input.tx.revertData);

  if (decoded) {
    const matches =
      SLIPPAGE_REVERT_SUFFIXES.some((suffix) => decoded.endsWith(suffix)) ||
      SLIPPAGE_REVERT_EXACT.includes(decoded);
    if (matches) {
      return {
        mode: "SLIPPAGE_REVERT",
        confidence: 0.95,
        evidence: { revertReason: decoded },
        ruleTriggered: "slippage:decodedReason",
      };
    }
    return null; // decoded reason exists but isn't slippage-related
  }

  if (SWAP_FUNCTION_SELECTORS.has(input.tx.functionSelector.toLowerCase())) {
    return {
      mode: "SLIPPAGE_REVERT",
      confidence: 0.55,
      evidence: {
        functionSelector: input.tx.functionSelector,
        note: "swap function reverted with no decodable reason — slippage is the most common cause for this function",
      },
      ruleTriggered: "slippage:genericRevertOnSwapSelector",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3.5 Insufficient allowance
// ---------------------------------------------------------------------------

function classifyInsufficientAllowance(input: DiagnosisInput): Diagnosis | null {
  if (input.tx.status !== "reverted") return null;

  const decoded = decodeRevertReason(input.tx.revertData);
  if (
    decoded &&
    (ALLOWANCE_REVERT_STRINGS.includes(decoded) || ALLOWANCE_PERMIT2_ERROR_NAMES.includes(decoded))
  ) {
    return {
      mode: "INSUFFICIENT_ALLOWANCE",
      confidence: 0.95,
      evidence: { revertReason: decoded },
      ruleTriggered: "allowance:decodedReason",
    };
  }

  if (input.wallet.tokenAllowance !== undefined && input.dappContext?.requiredAllowance !== undefined) {
    const required = input.dappContext.requiredAllowance;

    if (input.wallet.tokenAllowance < required) {
      return {
        mode: "INSUFFICIENT_ALLOWANCE",
        confidence: 0.9,
        evidence: { allowance: input.wallet.tokenAllowance, required },
        ruleTriggered: "allowance:inferredFromState",
      };
    }

    // Allowance itself is fine — check balance so the agent never tells
    // someone to "approve more" when they don't actually have the tokens.
    if (input.wallet.tokenBalance !== undefined && input.wallet.tokenBalance < required) {
      return {
        mode: "INSUFFICIENT_BALANCE",
        confidence: 0.9,
        evidence: { balance: input.wallet.tokenBalance, required },
        ruleTriggered: "allowance:actuallyInsufficientBalance",
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3.6 Stuck / pending bridge transaction
// ---------------------------------------------------------------------------

function classifyBridgeStatus(input: DiagnosisInput): Diagnosis | null {
  const bridge = input.bridge;
  if (!bridge) return null;

  if (!bridge.sourceTxConfirmed) {
    return {
      mode: "BRIDGE_SOURCE_NOT_CONFIRMED",
      confidence: 0.9,
      evidence: {
        note: "source-chain tx itself hasn't confirmed yet — not a bridge issue, wait for source confirmation",
      },
      ruleTriggered: "bridge:sourceNotConfirmed",
    };
  }

  if (bridge.destTxFound) {
    return {
      mode: "NOT_A_FAILURE",
      confidence: 0.95,
      evidence: { note: "bridge completed, user's ticket is stale" },
      ruleTriggered: "bridge:completed",
    };
  }

  if (bridge.sourceFinalizedAt === undefined) {
    // Not covered by the spec's pseudocode — sourceTxConfirmed=true implies
    // a finalized timestamp should exist. Handled defensively rather than
    // throwing, kept at low confidence since we genuinely can't evaluate
    // the elapsed-time window without it.
    return {
      mode: "BRIDGE_STUCK",
      confidence: 0.3,
      evidence: { note: "source confirmed but no finalized timestamp available to evaluate elapsed window" },
      ruleTriggered: "bridge:missingFinalizedTimestamp",
    };
  }

  const elapsedSeconds = Math.round(Date.now() / 1000 - bridge.sourceFinalizedAt);

  if (elapsedSeconds < bridge.expectedTimeSeconds) {
    return {
      mode: "BRIDGE_WITHIN_NORMAL_WINDOW",
      confidence: 0.85,
      evidence: {
        note: `${elapsedSeconds}s elapsed of expected ${bridge.expectedTimeSeconds}s — not stuck yet`,
        elapsedSeconds,
        expectedTimeSeconds: bridge.expectedTimeSeconds,
      },
      ruleTriggered: "bridge:withinWindow",
    };
  }

  return {
    mode: "BRIDGE_STUCK",
    // True root cause (relayer delay vs needs-manual-claim vs destination
    // gas) needs Phase 2's live protocol status lookup — this is the
    // intentional "stuck, cause unknown yet" checkpoint.
    confidence: 0.7,
    evidence: {
      note: `${elapsedSeconds}s exceeds expected ${bridge.expectedTimeSeconds}s window`,
      elapsedSeconds,
      expectedTimeSeconds: bridge.expectedTimeSeconds,
    },
    ruleTriggered: "bridge:exceededWindow",
  };
}

// ---------------------------------------------------------------------------
// 3.7 Reverted with a reason none of the specific rules matched
// ---------------------------------------------------------------------------

/**
 * Catch-all for reverted transactions that didn't match slippage or
 * allowance patterns. Surfaces the decoded revert reason (or the raw
 * revert data, if a custom error) so the caller has an actionable string
 * to look up, instead of the misleading "UNKNOWN_PENDING / no rule
 * matched" the fallback would otherwise produce. Only fires on
 * status === "reverted" — pending/success/not_found stay in the
 * fallback.
 */
function classifyRevertedOther(input: DiagnosisInput): Diagnosis | null {
  if (input.tx.status !== "reverted") return null;

  const decoded = decodeRevertReason(input.tx.revertData);
  if (decoded) {
    return {
      mode: "REVERTED_OTHER",
      confidence: 0.6,
      evidence: { revertReason: decoded },
      ruleTriggered: "revertedOther:decodedReason",
    };
  }

  if (input.tx.revertData && input.tx.revertData !== "0x") {
    return {
      mode: "REVERTED_OTHER",
      confidence: 0.5,
      evidence: {
        rawRevertData: input.tx.revertData,
        note: "custom error (not Error(string)) — first 4 bytes are the selector; a 4byte-directory lookup will identify it",
      },
      ruleTriggered: "revertedOther:undecodableCustomError",
    };
  }

  return {
    mode: "REVERTED_OTHER",
    confidence: 0.4,
    evidence: {
      note: "reverted with no data at all — the contract refused without leaving a reason; often signals a require() without a message or a call to a non-existent selector",
    },
    ruleTriggered: "revertedOther:noRevertData",
  };
}

// ---------------------------------------------------------------------------
// 2. Orchestrator — fixed priority order, first match wins
// ---------------------------------------------------------------------------

export function diagnose(input: DiagnosisInput, deps?: ClassifyDeps): Diagnosis {
  // WRONG_NETWORK is intentionally NOT in this list any more — per Phase 1
  // spec §2a, chain resolution now happens in the pipeline caller
  // (buildDiagnosisInput). The tx is diagnosed against whichever chain it
  // was actually resolved on; a dApp/wallet chain mismatch surfaces as a
  // `networkNote` attached to the result (not as a terminal mode that skips
  // the real diagnosis). `classifyWrongNetwork` remains exported below for
  // callers that want to check the old terminal condition on its own.
  void deps; // still accepted in the signature for backward compatibility (see classifyWrongNetwork)
  const rules: Array<() => Diagnosis | null> = [
    () => classifyNonceIssue(input),
    () => classifyGasUnderpriced(input),
    () => classifySlippageRevert(input),
    () => classifyInsufficientAllowance(input),
    () => classifyBridgeStatus(input),
    () => classifyRevertedOther(input),
  ];

  for (const rule of rules) {
    const result = rule();
    if (result) return result;
  }

  return {
    mode: "UNKNOWN_PENDING",
    confidence: 0.1,
    evidence: { note: "no rule matched — insufficient signal to classify" },
    ruleTriggered: "diagnose:noRuleMatched",
  };
}

// Exported individually so each rule stays independently unit-testable, per
// the spec's "keeps each rule testable in isolation" note.
export {
  classifyWrongNetwork,
  classifyNonceIssue,
  classifyGasUnderpriced,
  classifySlippageRevert,
  classifyInsufficientAllowance,
  classifyBridgeStatus,
  classifyRevertedOther,
  decodeRevertReason,
};
