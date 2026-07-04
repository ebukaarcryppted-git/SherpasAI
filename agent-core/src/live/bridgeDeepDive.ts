import type { Hash } from "viem";
import {
  lookupTransactionOnChain,
  X_LAYER_MAINNET_ID,
  ETHEREUM_MAINNET_ID,
  type TransactionLookup,
} from "@support-agent-asp/onchain-reader";

/**
 * Phase 2 bridge-stuck root-causing (spec section 3). Per the spec's own
 * build-priority guidance, this wires ONE bridge protocol fully — X Layer's
 * canonical bridge — rather than shallow-covering several. The other
 * sub-modes described in the spec (relayer delay, insufficient destination
 * gas) belong to a different bridge architecture (LayerZero/Wormhole-style
 * off-chain relayers with their own status APIs) that X Layer's canonical
 * OP-Stack + AggLayer bridge doesn't use, so they're left as explicit TODOs
 * rather than faked.
 */

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

/**
 * X Layer's docs (see docs/xlayer-onchainos.md, sourced from the official
 * X Layer developer docs) state a 7-day fraud-proof challenge period before
 * L1 finality on the OP-Stack + AggLayer design. An L2->L1 withdrawal past
 * this window with no L1 tx yet almost always means the user still needs
 * to submit the manual claim/finalize transaction on L1 — the canonical
 * bridge does not auto-execute that step. This is a documented fact, not a
 * guessed constant.
 */
const X_LAYER_CHALLENGE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

export interface BridgeDeepDiveReaders {
  lookupTransactionOnChain: (chainId: number, hash: Hash) => Promise<TransactionLookup>;
}

const defaultReaders: BridgeDeepDiveReaders = { lookupTransactionOnChain };

export interface DeepenBridgeStuckParams {
  sourceChainId: number;
  destinationChainId: number;
  minutesSinceSourceConfirmed: number;
  /** If the caller already knows (or can guess) the destination-chain tx hash, this catches a silent revert classify.ts's boolean destTxFound can't distinguish from "not there yet." */
  destinationTxHash?: Hash;
  readers?: Partial<BridgeDeepDiveReaders>;
}

/**
 * Enrichment layered on top of classify.ts's BRIDGE_STUCK result — never
 * called for statuses classify.ts already resolved definitively
 * (source-not-confirmed, or dest tx already found successful).
 */
export async function deepenBridgeStuck(params: DeepenBridgeStuckParams): Promise<BridgeDeepDiveResult> {
  const readers = { ...defaultReaders, ...params.readers };
  const elapsedSeconds = params.minutesSinceSourceConfirmed * 60;

  if (params.destinationTxHash) {
    const destTx = await readers.lookupTransactionOnChain(params.destinationChainId, params.destinationTxHash);
    if (destTx.status === "reverted") {
      return {
        subMode: "SILENTLY_FAILED_ON_DESTINATION",
        confidence: 0.9,
        note: "The destination-chain transaction exists and reverted — this isn't stuck in transit, the claim/mint attempt itself failed and needs to be retried.",
        evidence: { destinationTxHash: params.destinationTxHash, revertReason: destTx.revertReason },
      };
    }
    if (destTx.status === "success") {
      return {
        subMode: "UNKNOWN",
        confidence: 0.5,
        note: "The destination-chain transaction actually succeeded — this ticket may be stale, or the wrong destination hash was supplied.",
        evidence: { destinationTxHash: params.destinationTxHash },
      };
    }
    // pending or not_found on the destination chain — falls through to the checks below.
  }

  const isXLayerWithdrawal =
    params.sourceChainId === X_LAYER_MAINNET_ID && params.destinationChainId === ETHEREUM_MAINNET_ID;

  if (isXLayerWithdrawal && elapsedSeconds >= X_LAYER_CHALLENGE_PERIOD_SECONDS) {
    return {
      subMode: "NEEDS_MANUAL_CLAIM",
      confidence: 0.85,
      note: `Past X Layer's documented 7-day fraud-proof challenge period with no L1 transaction found. The canonical bridge requires a manual claim/finalize transaction on Ethereum after this window — it does not auto-execute. Check the bridge UI for a pending claim.`,
      evidence: {
        elapsedSeconds,
        challengePeriodSeconds: X_LAYER_CHALLENGE_PERIOD_SECONDS,
      },
    };
  }

  // Honest Phase 1 fallback for everything this specific bridge/route can't
  // yet resolve — deliberately not faking RELAYER_DELAY or
  // INSUFFICIENT_DEST_GAS without a verified data source for either.
  return {
    subMode: "UNKNOWN",
    confidence: 0.3,
    note: isXLayerWithdrawal
      ? "Still within the challenge period, or the exact root cause needs the Bridge Service/AggLayer indexer API (not available) — see docs/xlayer-onchainos.md."
      : "Root-causing this route needs protocol-specific status data (e.g. a relayer/message-tracking API) this project doesn't have wired in yet.",
    evidence: {},
  };
}
