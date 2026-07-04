import { isHash, type Hash } from "viem";
import {
  findTransactionAcrossChains,
  getGasContext,
  getNonceContext,
  X_LAYER_MAINNET_ID,
  SUPPORTED_CHAINS,
  type TransactionLookup,
} from "@support-agent-asp/onchain-reader";
import type { Diagnosis } from "./types.js";

const SLIPPAGE_HINTS = [
  "insufficient_output_amount",
  "too little received",
  "excessive input amount",
  "price impact too high",
  "slippage",
];

const ALLOWANCE_HINTS = ["allowance", "transfer_from_failed", "insufficient allowance"];

function chainLabel(chainId: number): string {
  return SUPPORTED_CHAINS[chainId]?.name ?? `chain ${chainId}`;
}

/**
 * The core "paste a tx hash, get a diagnosis" flow — the same engine used
 * by the website widget, the MCP tool, and the Discord/Telegram bots.
 */
export async function diagnoseTransaction(
  rawHash: string,
  expectedChainId: number = X_LAYER_MAINNET_ID
): Promise<Diagnosis> {
  if (!isHash(rawHash)) {
    return {
      hash: rawHash,
      mode: "not_found",
      chainLabel: null,
      headline: "That doesn't look like a transaction hash.",
      fix: "Transaction hashes are 66-character hex strings starting with 0x. Double-check and paste again.",
      details: {},
    };
  }

  const hash = rawHash as Hash;
  const crossChain = await findTransactionAcrossChains(hash, expectedChainId);
  const primary =
    crossChain.foundOn.find((r) => r.chainId === expectedChainId) ?? crossChain.foundOn[0];

  if (!primary) {
    return {
      hash,
      mode: "wrong_network",
      chainLabel: null,
      headline: `Not found on ${chainLabel(expectedChainId)} or the chains we cross-checked.`,
      fix: "Confirm this hash was actually sent to the chain you expect — it may have been broadcast on a different network entirely.",
      details: {},
    };
  }

  if (crossChain.wrongNetworkSuspected) {
    return {
      hash,
      mode: "wrong_network",
      chainLabel: chainLabel(primary.chainId),
      headline: `Found on ${chainLabel(primary.chainId)}, not ${chainLabel(expectedChainId)} as expected.`,
      fix: `Point your wallet/dApp at ${chainLabel(primary.chainId)} to see this transaction, or resend it on the chain you actually meant to use.`,
      details: {},
    };
  }

  if (primary.status === "success") {
    return {
      hash,
      mode: "healthy",
      chainLabel: chainLabel(primary.chainId),
      headline: "This transaction succeeded — no failure detected.",
      fix: "Nothing to fix here. If the outcome still looks wrong, check the emitted logs for the actual amounts settled.",
      details: {
        Block: primary.blockNumber?.toString() ?? "unknown",
        "Gas used": primary.gasUsed?.toString() ?? "unknown",
      },
    };
  }

  if (primary.status === "reverted") {
    return diagnoseReverted(primary, chainLabel(primary.chainId));
  }

  if (primary.status === "pending") {
    return diagnosePending(primary, chainLabel(primary.chainId));
  }

  return {
    hash,
    mode: "not_found",
    chainLabel: null,
    headline: "Couldn't determine transaction status.",
    fix: "Try again in a moment, or check the hash on a block explorer directly.",
    details: {},
  };
}

function diagnoseReverted(tx: TransactionLookup, label: string): Diagnosis {
  const reason = tx.revertReason;
  const lower = (reason ?? "").toLowerCase();

  if (SLIPPAGE_HINTS.some((hint) => lower.includes(hint))) {
    return {
      hash: tx.hash,
      mode: "slippage",
      chainLabel: label,
      headline: "Reverted on slippage — the price moved past your tolerance.",
      fix: "Increase slippage tolerance to 1% (or the current market volatility) and retry. If the pair has thin liquidity, consider splitting the trade into smaller size.",
      details: { "Revert reason": reason ?? "unknown" },
    };
  }

  if (ALLOWANCE_HINTS.some((hint) => lower.includes(hint))) {
    return {
      hash: tx.hash,
      mode: "allowance",
      chainLabel: label,
      headline: "Reverted on a token allowance check.",
      fix: "Approve the spender contract for at least the amount you're trying to move, then retry the transaction.",
      details: { "Revert reason": reason ?? "unknown" },
    };
  }

  return {
    hash: tx.hash,
    mode: "reverted_other",
    chainLabel: label,
    headline: "Transaction reverted.",
    fix: reason
      ? `Contract reverted with: "${reason}". Check the calling contract's logic against that reason.`
      : "Reverted without a decodable reason — inspect the calldata against the target contract's expected inputs.",
    details: reason ? { "Revert reason": reason } : {},
  };
}

async function diagnosePending(tx: TransactionLookup, label: string): Promise<Diagnosis> {
  if (!tx.from) {
    return {
      hash: tx.hash,
      mode: "pending",
      chainLabel: label,
      headline: "Still pending.",
      fix: "Give it a little longer, or check the block explorer for network status.",
      details: {},
    };
  }

  const [gas, nonce] = await Promise.all([
    getGasContext(tx.chainId, { gasPrice: tx.gasPrice, maxFeePerGas: tx.maxFeePerGas }),
    getNonceContext(tx.chainId, tx.from, tx.nonce),
  ]);

  if (nonce.hasGap) {
    return {
      hash: tx.hash,
      mode: "nonce_gap",
      chainLabel: label,
      headline: `Nonce ${tx.nonce} is queued behind nonce ${nonce.latestNonce}, which hasn't confirmed yet.`,
      fix: `Find and confirm (or replace/cancel) the transaction using nonce ${nonce.latestNonce} first — everything after it is blocked until it lands.`,
      details: {
        "Tx nonce": String(tx.nonce),
        "Latest confirmed nonce": String(nonce.latestNonce),
        "Pending nonce": String(nonce.pendingNonce),
      },
    };
  }

  if (gas.underpriced) {
    return {
      hash: tx.hash,
      mode: "gas_too_low",
      chainLabel: label,
      headline: "Gas price is below current network conditions — stuck in the mempool.",
      fix: `Resubmit with a gas price at or above ~${gas.currentGasPrice.toString()} wei (current network price), or use replace-by-fee to speed up this exact tx.`,
      details: {
        "Tx gas price": (gas.txMaxFeePerGas ?? gas.txGasPrice ?? BigInt(0)).toString(),
        "Current network gas price": gas.currentGasPrice.toString(),
      },
    };
  }

  return {
    hash: tx.hash,
    mode: "pending",
    chainLabel: label,
    headline: "Still pending — gas and nonce both look normal.",
    fix: "Give it a little longer. If it's been more than a few minutes past the chain's normal block time, the sequencer may be congested — check the block explorer for network status.",
    details: { Nonce: String(tx.nonce) },
  };
}
