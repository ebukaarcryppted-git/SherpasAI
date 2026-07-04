import type { Hash, Hex } from "viem";
import { getClient, lookupTransactionOnChain, type TransactionLookup } from "@support-agent-asp/onchain-reader";
import type { DiagnosisInput } from "../classify.js";

/**
 * Builds classify.ts's raw `bridge` facts from live reads — deliberately
 * NOT reusing onchain-reader's checkBridgeStatus, which does its own
 * pre-classification (a "status" enum). That would create two competing
 * classifiers; classify.ts is meant to be the single source of truth for
 * bridge-mode classification per the Phase 2 spec, so this only supplies
 * the raw booleans/timestamps it needs.
 */

export interface BuildBridgeInputParams {
  sourceChainId: number;
  destinationChainId: number;
  sourceTxHash: Hash;
  /** If known, checked directly — far more precise than the activity fallback below. */
  destinationTxHash?: Hash;
  /** Weak fallback signal when destinationTxHash isn't known: any tx activity from this address on the destination chain. */
  recipientAddress?: Hex;
  expectedTimeSeconds: number;
  protocol: string;
  readers?: Partial<{
    lookupTransactionOnChain: (chainId: number, hash: Hash) => Promise<TransactionLookup>;
  }>;
}

export async function buildBridgeInput(
  params: BuildBridgeInputParams
): Promise<{ bridge: DiagnosisInput["bridge"]; sourceTx: TransactionLookup }> {
  const lookup = params.readers?.lookupTransactionOnChain ?? lookupTransactionOnChain;

  const sourceTx = await lookup(params.sourceChainId, params.sourceTxHash);
  const sourceTxConfirmed = sourceTx.status === "success";

  let sourceFinalizedAt: number | undefined;
  if (sourceTxConfirmed && sourceTx.blockNumber !== undefined) {
    const block = await getClient(params.sourceChainId).getBlock({ blockNumber: sourceTx.blockNumber });
    sourceFinalizedAt = Number(block.timestamp);
  }

  let destTxFound = false;
  if (params.destinationTxHash) {
    const destTx = await lookup(params.destinationChainId, params.destinationTxHash);
    destTxFound = destTx.status === "success";
  } else if (params.recipientAddress) {
    // Weak signal only: nonzero activity doesn't prove this specific
    // transfer arrived, just that the address has done *something* on the
    // destination chain. Documented the same way in onchain-reader/bridge.ts.
    const count = await getClient(params.destinationChainId).getTransactionCount({
      address: params.recipientAddress,
    });
    destTxFound = count > 0;
  }

  return {
    bridge: {
      protocol: params.protocol,
      sourceTxConfirmed,
      sourceFinalizedAt,
      destTxFound,
      expectedTimeSeconds: params.expectedTimeSeconds,
    },
    sourceTx,
  };
}
