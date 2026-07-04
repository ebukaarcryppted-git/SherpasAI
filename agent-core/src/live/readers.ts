import type { Hash, Hex } from "viem";
import {
  findTransactionAcrossChains,
  lookupTransactionOnChain,
  getNonceContext,
  getGasContext,
  getAllowance,
  getBaseFeeAtTimestamp,
  getClient,
  type CrossChainTxLookup,
  type NonceContext,
  type GasContext,
  type AllowanceContext,
  type TransactionLookup,
} from "@support-agent-asp/onchain-reader";
import { getAmountsOutOnChain } from "./quantifySlippage.js";

/**
 * Everything buildDiagnosisInput/diagnoseLive/buildBridgeInput needs from
 * onchain-reader, expressed as one interface so tests can inject fakes
 * instead of hitting live RPCs. Default implementation below is the real
 * thing. Kept as a single shared interface (rather than one per module) so
 * a params.readers override passed into diagnoseLive() reaches every
 * sub-call it makes, not just the first one.
 */
export interface LiveReaders {
  findTransactionAcrossChains: (hash: Hash, expectedChainId?: number) => Promise<CrossChainTxLookup>;
  lookupTransactionOnChain: (chainId: number, hash: Hash) => Promise<TransactionLookup>;
  getNonceContext: (chainId: number, address: Hex, txNonce?: number) => Promise<NonceContext>;
  getGasContext: (
    chainId: number,
    tx?: { gasPrice?: bigint; maxFeePerGas?: bigint }
  ) => Promise<GasContext>;
  getAllowance: (chainId: number, token: Hex, owner: Hex, spender: Hex) => Promise<AllowanceContext>;
  getBaseFeeAtTimestamp: (chainId: number, timestampSeconds: number) => Promise<bigint | null>;
  /** Used only for the empty-revert-data wrong-network supplementary signal. */
  getCode: (chainId: number, address: Hex) => Promise<Hex | undefined>;
  /** Used only for quantified slippage — the last element of a V2 router's getAmountsOut(amountIn, path). */
  getAmountsOut: (
    chainId: number,
    router: Hex,
    amountIn: bigint,
    path: readonly Hex[],
    blockNumber: bigint
  ) => Promise<bigint>;
}

export const defaultLiveReaders: LiveReaders = {
  findTransactionAcrossChains,
  lookupTransactionOnChain,
  getNonceContext,
  getGasContext,
  getAllowance,
  getBaseFeeAtTimestamp,
  getCode: (chainId, address) => getClient(chainId).getCode({ address }),
  getAmountsOut: getAmountsOutOnChain,
};
