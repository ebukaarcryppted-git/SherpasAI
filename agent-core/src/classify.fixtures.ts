import type { DiagnosisInput } from "./classify.js";

/**
 * Seeded fixtures for the Phase 1 classifier (spec section 5). One
 * clean-signal and one ambiguous-signal case per mode, plus the two
 * explicit negative cases the spec calls out by name — deliberately
 * written so the test suite proves the classifier doesn't over-fire.
 */

const BASE_TX: DiagnosisInput["tx"] = {
  hash: "0x0000000000000000000000000000000000000000000000000000000000aaaa",
  chainId: 196,
  status: "pending",
  from: "0x1111111111111111111111111111111111111111",
  to: "0x2222222222222222222222222222222222222222",
  functionSelector: "0x00000000",
  nonce: 10,
  submittedAt: 1_700_000_000,
};

const BASE_WALLET: DiagnosisInput["wallet"] = {
  address: "0x1111111111111111111111111111111111111111",
  connectedChainId: 196,
  confirmedNonce: 10,
  pendingNonce: 10,
};

const BASE_NETWORK: DiagnosisInput["networkState"] = {
  currentBaseFee: BigInt(1_000_000_000),
};

/** Standard Error(string) ABI encoding for a given reason string. */
function encodeErrorString(reason: string): `0x${string}` {
  // selector (4 bytes) + offset (32 bytes, always 0x20) + length (32 bytes) + utf8 bytes, right-padded to 32
  const utf8 = Buffer.from(reason, "utf8");
  const lengthHex = utf8.length.toString(16).padStart(64, "0");
  const dataHex = utf8.toString("hex").padEnd(Math.ceil((utf8.length * 2) / 64) * 64, "0");
  const offsetHex = (32).toString(16).padStart(64, "0");
  return `0x08c379a0${offsetHex}${lengthHex}${dataHex}` as `0x${string}`;
}

// --- Slippage ---------------------------------------------------------------

export const slippageDecodable: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x414bf389", // exactInputSingle
    revertData: encodeErrorString("Too little received"),
  },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};

export const slippageGenericRevert: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x38ed1739", // swapExactTokensForTokens
    revertData: undefined,
  },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};

/**
 * Reverted with a custom-error selector (not the standard Error(string)
 * encoding) — decodeRevertReason can't decode this, so it must behave
 * exactly like "no decodable reason" and fall back to the generic
 * swap-selector heuristic, not throw or silently misclassify.
 */
export const slippageCustomErrorUndecodable: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x7ff36ab5", // swapExactETHForTokens
    revertData: "0xdeadbeef0000000000000000000000000000000000000000000000000000",
  },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};

// --- Allowance ---------------------------------------------------------------

export const allowanceDecodable: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x23b872dd", // transferFrom
    revertData: encodeErrorString("ERC20: transfer amount exceeds allowance"),
  },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};

export const allowanceInferred: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x23b872dd",
    revertData: undefined,
  },
  wallet: { ...BASE_WALLET, tokenAllowance: BigInt(50), tokenBalance: BigInt(1_000) },
  dappContext: { expectedChainId: 196, requiredAllowance: BigInt(100) },
  networkState: BASE_NETWORK,
};

/** Negative-adjacent case: allowance is fine, but balance is actually the problem — must not be mislabeled as allowance. */
export const insufficientBalanceNotAllowance: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x23b872dd",
    revertData: undefined,
  },
  wallet: { ...BASE_WALLET, tokenAllowance: BigInt(500), tokenBalance: BigInt(10) },
  dappContext: { expectedChainId: 196, requiredAllowance: BigInt(100) },
  networkState: BASE_NETWORK,
};

// --- Wrong network ------------------------------------------------------------

export const wrongNetworkDappMismatch: DiagnosisInput = {
  tx: { ...BASE_TX, status: "success" },
  wallet: { ...BASE_WALLET, connectedChainId: 1 },
  dappContext: { expectedChainId: 196 },
  networkState: BASE_NETWORK,
};

export const wrongNetworkCrossChainFound: DiagnosisInput = {
  tx: { ...BASE_TX, status: "not_found", chainId: 196 },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};
/** Paired dependency for wrongNetworkCrossChainFound — hash resolves on chain 1 instead. */
export const wrongNetworkCrossChainDeps = { crossChainLookup: () => 1 };

// --- Bridge stuck ---------------------------------------------------------------

const NOW_SECONDS = Math.floor(Date.now() / 1000);

export const bridgePastSla: DiagnosisInput = {
  tx: { ...BASE_TX, status: "success" },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
  bridge: {
    protocol: "x-layer-canonical",
    sourceTxConfirmed: true,
    sourceFinalizedAt: NOW_SECONDS - 3_600, // an hour ago
    destTxFound: false,
    expectedTimeSeconds: 900, // 15 min SLA
  },
};

/** Negative case: still within the normal window — must NOT classify as stuck. */
export const bridgeWithinWindow: DiagnosisInput = {
  tx: { ...BASE_TX, status: "success" },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
  bridge: {
    protocol: "x-layer-canonical",
    sourceTxConfirmed: true,
    sourceFinalizedAt: NOW_SECONDS - 60, // a minute ago
    destTxFound: false,
    expectedTimeSeconds: 900,
  },
};

export const bridgeSourceNotConfirmed: DiagnosisInput = {
  tx: { ...BASE_TX, status: "success" },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
  bridge: {
    protocol: "x-layer-canonical",
    sourceTxConfirmed: false,
    destTxFound: false,
    expectedTimeSeconds: 900,
  },
};

/** Destination tx already found — bridge completed, ticket is stale. */
export const bridgeCompleted: DiagnosisInput = {
  tx: { ...BASE_TX, status: "success" },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
  bridge: {
    protocol: "x-layer-canonical",
    sourceTxConfirmed: true,
    sourceFinalizedAt: NOW_SECONDS - 3_600,
    destTxFound: true,
    expectedTimeSeconds: 900,
  },
};

// --- Gas underpriced ---------------------------------------------------------------

export const gasBelowCurrentBaseFee: DiagnosisInput = {
  tx: { ...BASE_TX, status: "pending", maxFeePerGas: BigInt(500_000_000) },
  wallet: BASE_WALLET,
  networkState: { currentBaseFee: BigInt(1_000_000_000) },
};

export const gasBorderlineAtSubmission: DiagnosisInput = {
  tx: { ...BASE_TX, status: "pending", maxFeePerGas: BigInt(1_020_000_000) },
  wallet: BASE_WALLET,
  networkState: {
    currentBaseFee: BigInt(1_000_000_000), // at/above current, so the first branch doesn't fire
    baseFeeAtSubmission: BigInt(1_000_000_000), // 1.02x submission fee < 1.05x threshold
  },
};

/** Legacy (pre-EIP-1559) tx — priced via gasPrice, not maxFeePerGas. */
export const gasLegacyBelowCurrentBaseFee: DiagnosisInput = {
  tx: { ...BASE_TX, status: "pending", gasPrice: BigInt(500_000_000) },
  wallet: BASE_WALLET,
  networkState: { currentBaseFee: BigInt(1_000_000_000) },
};

/** Neither maxFeePerGas nor gasPrice set — the gas rule can't evaluate and must fall through, not crash. */
export const gasFeeDataMissing: DiagnosisInput = {
  tx: { ...BASE_TX, status: "pending" },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};

// --- Nonce ---------------------------------------------------------------

export const nonceGapAbovePending: DiagnosisInput = {
  tx: { ...BASE_TX, status: "pending", nonce: 15 },
  wallet: { ...BASE_WALLET, confirmedNonce: 10, pendingNonce: 12 },
  networkState: BASE_NETWORK,
};

export const nonceAlreadyUsed: DiagnosisInput = {
  tx: { ...BASE_TX, status: "pending", nonce: 8 },
  wallet: { ...BASE_WALLET, confirmedNonce: 10, pendingNonce: 12 },
  networkState: BASE_NETWORK,
};

/** Negative case: nonce is correct AND gas is fine — must fall through to UNKNOWN_PENDING, not fire nonce or gas rules. */
export const nonceAndGasBothCorrect: DiagnosisInput = {
  tx: { ...BASE_TX, status: "pending", nonce: 10, maxFeePerGas: BigInt(2_000_000_000) },
  wallet: { ...BASE_WALLET, confirmedNonce: 10, pendingNonce: 10 },
  networkState: { currentBaseFee: BigInt(1_000_000_000) },
};

/** Same as nonceAlreadyUsed but via a "not_found" tx status — the nonce rule's trigger condition covers both pending and not_found. */
export const nonceAlreadyUsedNotFound: DiagnosisInput = {
  tx: { ...BASE_TX, status: "not_found", nonce: 8 },
  wallet: { ...BASE_WALLET, confirmedNonce: 10, pendingNonce: 12 },
  networkState: BASE_NETWORK,
};

// --- Reverted with a non-specific reason (catch-all) -------------------------

/**
 * Reverted, decodable Error(string) reason, but the reason doesn't match any
 * specific pattern (not slippage, not allowance) — the catch-all rule should
 * fire and surface the reason as evidence.
 */
export const revertedOtherDecodable: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x11223344", // arbitrary non-swap selector
    revertData: encodeErrorString("swap call failed"),
  },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};

/**
 * Reverted with an undecodable custom error (not Error(string) encoding),
 * and no other rule applies — catch-all should still fire and surface the
 * raw revert data.
 */
export const revertedOtherCustomError: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x11223344",
    revertData: "0xdeadbeef",
  },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};

/**
 * Reverted with no revert data at all — catch-all fires with a lower-confidence
 * "no reason" note.
 */
export const revertedOtherNoData: DiagnosisInput = {
  tx: {
    ...BASE_TX,
    status: "reverted",
    functionSelector: "0x11223344",
    revertData: "0x",
  },
  wallet: BASE_WALLET,
  networkState: BASE_NETWORK,
};
