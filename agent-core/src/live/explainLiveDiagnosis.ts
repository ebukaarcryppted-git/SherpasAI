import type { ClassifiedMode } from "../classify.js";
import type { QuantifiedSlippage } from "./quantifySlippage.js";
import type { BridgeDeepDiveResult } from "./bridgeDeepDive.js";

export interface ExplainableDiagnosis {
  mode: ClassifiedMode;
  evidence: Record<string, unknown>;
  quantifiedSlippage?: QuantifiedSlippage;
  bridgeDeepDive?: BridgeDeepDiveResult;
}

export interface Explanation {
  headline: string;
  fix: string;
}

function val(v: unknown): string {
  return v === undefined || v === null ? "unknown" : String(v);
}

const BRIDGE_STUCK_SUBMODE_FIX: Record<BridgeDeepDiveResult["subMode"], string> = {
  NEEDS_MANUAL_CLAIM:
    "Go to the bridge's UI and look for a manual claim/finalize button — this bridge path doesn't auto-deliver funds after the challenge period.",
  SILENTLY_FAILED_ON_DESTINATION:
    "The destination-side transaction appears to have failed silently. Check the destination tx directly on a block explorer, and contact the bridge operator's support with both tx hashes.",
  RELAYER_DELAY:
    "This looks like a relayer delay rather than a stuck transfer. Wait a bit longer; if it doesn't resolve, contact the bridge operator's support.",
  INSUFFICIENT_DEST_GAS:
    "The destination-chain delivery likely needs gas that wasn't provided. Check the bridge UI for a way to supply destination gas, or contact the bridge operator's support.",
  UNKNOWN:
    "Check the bridge UI for a pending claim option, or contact the bridge operator's support with this tx hash.",
};

/**
 * Turns classify.ts's raw mode/evidence into the same kind of actionable,
 * plain-English headline+fix the free website widget gives (see
 * diagnoseTransaction.ts / diagnoseBridge.ts) — so paid MCP/A2MCP callers
 * get "what do I do about it" guidance, not just a mode code and a
 * confidence score.
 */
export function explainLiveDiagnosis(diagnosis: ExplainableDiagnosis): Explanation {
  const { mode, evidence, quantifiedSlippage, bridgeDeepDive } = diagnosis;

  switch (mode) {
    case "WRONG_NETWORK":
      return {
        headline: "Your wallet was connected to a different network than this transaction needed.",
        fix: `Switch your wallet to chain ID ${val(evidence.expected ?? evidence.expectedChainId)} and retry — it was connected to (or the tx was found on) chain ID ${val(evidence.connected ?? evidence.foundOnChainId)} instead.`,
      };

    case "NONCE_ALREADY_USED":
      return {
        headline: "This transaction's nonce was already used by a different, already-confirmed transaction from the same wallet.",
        fix: `Nonce ${val(evidence.txNonce)} has already been consumed (the wallet's confirmed nonce is now ${val(evidence.confirmedNonce)}). This exact transaction will never confirm — a different tx got there first. Submit a new transaction instead.`,
      };

    case "NONCE_GAP":
      return {
        headline: "An earlier transaction from this wallet hasn't confirmed yet, so this one is stuck waiting behind it.",
        fix: `This tx was sent with nonce ${val(evidence.txNonce)}, but the wallet's next expected nonce is still ${val(evidence.pendingNonce)}. Find the pending transaction at that nonce and either wait for it, speed it up with higher gas, or cancel it (send a 0-value tx to yourself at that same nonce with higher gas). Once it clears, this one confirms automatically.`,
      };

    case "GAS_UNDERPRICED":
      return {
        headline: "This transaction is stuck because its gas fee is below what the network currently requires.",
        fix: `The tx's fee (${val(evidence.txFee)}) is below the current requirement (${val(evidence.currentBaseFee ?? evidence.baseFeeAtSubmission)}). Resubmit with a higher gas price/fee, or use your wallet's "speed up" option — waiting can also work if network congestion eases.`,
      };

    case "SLIPPAGE_REVERT":
      if (quantifiedSlippage) {
        return {
          headline: `The price moved ${quantifiedSlippage.priceMovementPercent.toFixed(2)}% against you while this swap was pending, exceeding your ${quantifiedSlippage.slippageTolerancePercent.toFixed(2)}% slippage tolerance.`,
          fix: `Retry with a higher slippage tolerance (comfortably above ${quantifiedSlippage.slippageTolerancePercent.toFixed(2)}%) — 1% is a safe starting point for liquid pairs, 3-5% for thin or volatile pools. Breaking large trades into smaller chunks also helps on shallow-liquidity pools.`,
        };
      }
      return {
        headline: "This is a classic swap failure — the price moved past the minimum output you told your wallet you'd accept.",
        fix: "Retry with a higher slippage tolerance (1% is a safe starting point, 3-5% for volatile or thin-liquidity pairs), or split the trade into smaller chunks if the pool doesn't have much depth.",
      };

    case "INSUFFICIENT_ALLOWANCE":
      return {
        headline: "Your wallet hasn't approved this contract to spend the token yet.",
        fix:
          evidence.required !== undefined
            ? `Approve at least ${val(evidence.required)} of the token for this contract (current allowance is ${val(evidence.allowance)}), then retry.`
            : "Submit an approval transaction for this token/contract pair, then retry the original transaction.",
      };

    case "INSUFFICIENT_BALANCE":
      return {
        headline: "Your wallet doesn't hold enough of the token this transaction needed to spend.",
        fix: `You need at least ${val(evidence.required)} but the balance is ${val(evidence.balance)}. Top up the token balance, then retry.`,
      };

    case "BRIDGE_SOURCE_NOT_CONFIRMED":
      return {
        headline: "The source-chain transaction hasn't confirmed yet — this isn't a bridge problem.",
        fix: "Wait for the source-chain transaction to confirm first; the bridge transfer can't begin until it does.",
      };

    case "BRIDGE_WITHIN_NORMAL_WINDOW":
      return {
        headline: "Funds are still in transit — this is within the bridge's normal transfer window.",
        fix: "No action needed yet. Check back once the expected transfer time has elapsed.",
      };

    case "BRIDGE_STUCK":
      return {
        headline: bridgeDeepDive
          ? `This transfer is past its normal window — most likely cause: ${bridgeDeepDive.note}`
          : "This transfer has exceeded its normal bridging window.",
        fix: bridgeDeepDive
          ? BRIDGE_STUCK_SUBMODE_FIX[bridgeDeepDive.subMode]
          : "Check the bridge UI for a pending claim button — some paths require a manual claim on the destination chain. If there's still nothing after a further wait, contact the bridge operator's support with this tx hash.",
      };

    case "NOT_A_FAILURE":
      return {
        headline: "Good news — this went through fine.",
        fix: "There's nothing to fix here.",
      };

    case "UNKNOWN_PENDING":
      return {
        headline: "Still processing, and nothing conclusive stands out yet.",
        fix: "Give it a bit more time — nonce and gas both look normal, so this is most likely just network congestion. Check a block explorer directly if it's taking unusually long.",
      };

    case "REVERTED_OTHER":
      if (typeof evidence.revertReason === "string") {
        return {
          headline: "The transaction reverted — the contract rejected it and undid everything.",
          fix: `The contract's revert reason was: "${evidence.revertReason}". That's usually a require()/condition check (balance, permission, amount, deadline) that didn't hold. If this is your own contract, check that code path; if it's someone else's protocol, this reason is exactly what their support would need.`,
        };
      }
      if (typeof evidence.rawRevertData === "string") {
        return {
          headline: "The transaction reverted with a custom error that couldn't be decoded into a plain-English reason.",
          fix: `The raw revert data is ${evidence.rawRevertData} — its first 4 bytes are the error selector. Look that selector up in a 4byte-directory (e.g. openchain.xyz/signatures) to identify the specific error, or check the contract's ABI directly.`,
        };
      }
      return {
        headline: "The transaction reverted with no data at all — the contract refused without leaving a reason.",
        fix: "This is common with a require() that has no message, or a call to a selector the contract doesn't implement. Compare what your wallet actually sent (function selector + arguments) against what the target contract expects, ideally via a block explorer's decode-input view.",
      };
  }
}
