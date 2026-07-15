import type { Hash } from "viem";
import { getClient } from "./client.js";
import { lookupTransactionOnChain } from "./tx.js";
import type { BridgeContext, BridgeStatus } from "./types.js";

/**
 * How long a canonical bridge transfer is expected to take before we stop
 * calling it "in transit" and admit we have no further RPC-based signal.
 * This is a heuristic, not a guarantee from the bridge indexer — kept
 * generous since some bridge paths need a manual claim step rather than an
 * automatic mint.
 */
const IN_TRANSIT_GRACE_MINUTES = 15;

/**
 * Best-effort check for the "stuck/pending bridge transaction" failure mode,
 * from the source-chain tx hash alone.
 *
 * Full correlation (matching a specific L1 deposit to its L2 mint, or an L2
 * withdrawal to its L1 claim) would need the X Layer Bridge Service /
 * AggLayer indexer API — investigated directly against OKX's X Layer
 * onchaindata API (challengeStatus/l1OriginHash fields on
 * address/transaction-list) and confirmed those fields don't populate in
 * practice, even for a live "Pending claim" withdrawal. An earlier version
 * of this function asked for a destination recipient address and used its
 * transaction-count as a proxy signal, but that's a false-positive trap: any
 * wallet with prior unrelated activity on the destination chain would
 * always read as "likely completed" regardless of whether this specific
 * transfer arrived. Dropped entirely rather than keep a heuristic that
 * actively misleads — this now only reports what the source-chain tx alone
 * can honestly tell you.
 */
export async function checkBridgeStatus(
  sourceChainId: number,
  destinationChainId: number,
  sourceTxHash: Hash
): Promise<BridgeContext> {
  const sourceTx = await lookupTransactionOnChain(sourceChainId, sourceTxHash);

  if (!sourceTx.found || sourceTx.status === "not_found") {
    return {
      sourceChainId,
      destinationChainId,
      sourceTx,
      status: "unknown",
      minutesSinceSourceConfirmed: null,
      note: "Source-chain transaction not found. Confirm the hash and source chain are correct.",
    };
  }

  if (sourceTx.status === "reverted") {
    return {
      sourceChainId,
      destinationChainId,
      sourceTx,
      status: "unknown",
      minutesSinceSourceConfirmed: null,
      note: "Source-chain transaction reverted — funds never left the source chain, so there's nothing to bridge.",
    };
  }

  if (sourceTx.status === "pending") {
    return {
      sourceChainId,
      destinationChainId,
      sourceTx,
      status: "source_pending",
      minutesSinceSourceConfirmed: null,
      note: "Source-chain transaction hasn't confirmed yet; the bridge can't start processing until it does.",
    };
  }

  // status === "success" from here on
  const sourceClient = getClient(sourceChainId);
  const minutesSinceSourceConfirmed = await minutesSinceBlock(
    sourceClient,
    sourceTx.blockNumber
  );

  let status: BridgeStatus;
  let note: string;

  if (minutesSinceSourceConfirmed === null) {
    status = "unknown";
    note = "Source tx confirmed but its block timestamp couldn't be read.";
  } else if (minutesSinceSourceConfirmed < IN_TRANSIT_GRACE_MINUTES) {
    status = "in_transit";
    note = `Source tx confirmed ${minutesSinceSourceConfirmed}m ago — still within the normal transfer window. Funds are likely in transit.`;
  } else {
    status = "past_normal_window";
    note = `Source tx confirmed ${minutesSinceSourceConfirmed}m ago, past the normal transfer window. This doesn't necessarily mean something's wrong — some bridge paths need a manual claim step on the destination chain rather than an automatic mint. Check the bridge UI for a pending claim, or check your destination-chain wallet directly. If there's genuinely nothing after a further wait, contact the bridge operator's support with this tx hash.`;
  }

  return {
    sourceChainId,
    destinationChainId,
    sourceTx,
    status,
    minutesSinceSourceConfirmed,
    note,
  };
}

async function minutesSinceBlock(
  client: ReturnType<typeof getClient>,
  blockNumber: bigint | undefined
): Promise<number | null> {
  if (blockNumber === undefined) return null;
  try {
    const block = await client.getBlock({ blockNumber });
    const elapsedSeconds = Date.now() / 1000 - Number(block.timestamp);
    return Math.max(0, Math.round(elapsedSeconds / 60));
  } catch {
    return null;
  }
}
