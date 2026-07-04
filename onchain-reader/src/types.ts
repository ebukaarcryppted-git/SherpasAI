import type { Hash, Hex, TransactionReceipt } from "viem";

export interface TransactionLookup {
  found: boolean;
  chainId: number;
  hash: Hash;
  status?: "success" | "reverted" | "pending" | "not_found";
  /** Best-effort human-readable revert reason (decoded string, or a generic message if it couldn't be decoded). */
  revertReason?: string;
  /**
   * Raw ABI-encoded revert bytes (e.g. "0x08c379a0..." for a standard
   * Error(string), or a bare 4-byte custom-error selector like "0x4e47f8ea"
   * for an unverified/custom-error contract). This is what
   * agent-core's classify.ts decodes itself — kept separate from
   * revertReason because classify.ts needs the raw bytes, not a
   * pre-decoded string, to apply its own suffix/selector matching.
   */
  rawRevertData?: Hex;
  from?: Hex;
  to?: Hex | null;
  /** Raw calldata sent to `to` — first 4 bytes are the function selector classify.ts matches against. */
  input?: Hex;
  nonce?: number;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasUsed?: bigint;
  blockNumber?: bigint;
  receipt?: TransactionReceipt;
}

/** Result of scanning every supported chain for a given tx hash. */
export interface CrossChainTxLookup {
  hash: Hash;
  expectedChainId?: number;
  foundOn: TransactionLookup[];
  /** true if found on a chain other than the expected one (or expected tx is missing entirely) */
  wrongNetworkSuspected: boolean;
}

export interface AllowanceContext {
  chainId: number;
  token: Hex;
  owner: Hex;
  spender: Hex;
  allowance: bigint;
  decimals: number;
  symbol: string;
}

export interface GasContext {
  chainId: number;
  currentBaseFeePerGas: bigint | null;
  currentGasPrice: bigint;
  txGasPrice?: bigint;
  txMaxFeePerGas?: bigint;
  underpriced: boolean;
}

export interface NonceContext {
  chainId: number;
  address: Hex;
  latestNonce: number;
  pendingNonce: number;
  txNonce?: number;
  hasGap: boolean;
  hasPendingBacklog: boolean;
}

export type BridgeStatus =
  | "source_pending"
  | "in_transit"
  | "needs_claim"
  | "likely_completed"
  | "stuck"
  | "unknown";

export interface BridgeContext {
  sourceChainId: number;
  destinationChainId: number;
  sourceTx: TransactionLookup;
  status: BridgeStatus;
  /** minutes since the source tx confirmed, if known */
  minutesSinceSourceConfirmed: number | null;
  /** best-effort: whether the destination chain shows any recent inbound activity for this address */
  destinationActivityDetected: boolean;
  note: string;
}
