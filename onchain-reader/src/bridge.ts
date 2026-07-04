import type { Hash, Hex } from "viem";
import { getClient } from "./client.js";
import { lookupTransactionOnChain } from "./tx.js";
import type { BridgeContext, BridgeStatus } from "./types.js";

/**
 * How long a canonical bridge transfer is expected to take before we treat
 * "no destination activity yet" as suspicious rather than just normal
 * in-flight latency. This is a heuristic, not a guarantee from the bridge
 * indexer (see note below) — kept generous since some bridge paths need a
 * manual claim step rather than an automatic mint.
 */
const IN_TRANSIT_GRACE_MINUTES = 15;

/**
 * Best-effort check for the "stuck/pending bridge transaction" failure mode.
 *
 * Full correlation (matching a specific L1 deposit to its L2 mint, or an L2
 * withdrawal to its L1 claim) requires the X Layer Bridge Service / AggLayer
 * indexer API, which is not covered by the docs fetched into
 * docs/xlayer-onchainos.md. Until that's wired up, this reports what public
 * RPCs alone can tell us: the source-chain tx's confirmation status and
 * elapsed time, plus whether the recipient address shows any activity on
 * the destination chain (a weak signal, not proof of a matching mint/claim).
 */
export async function checkBridgeStatus(
  sourceChainId: number,
  destinationChainId: number,
  sourceTxHash: Hash,
  recipient: Hex
): Promise<BridgeContext> {
  const sourceTx = await lookupTransactionOnChain(sourceChainId, sourceTxHash);

  if (!sourceTx.found || sourceTx.status === "not_found") {
    return {
      sourceChainId,
      destinationChainId,
      sourceTx,
      status: "unknown",
      minutesSinceSourceConfirmed: null,
      destinationActivityDetected: false,
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
      destinationActivityDetected: false,
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
      destinationActivityDetected: false,
      note: "Source-chain transaction hasn't confirmed yet; the bridge can't start processing until it does.",
    };
  }

  // status === "success" from here on
  const sourceClient = getClient(sourceChainId);
  const minutesSinceSourceConfirmed = await minutesSinceBlock(
    sourceClient,
    sourceTx.blockNumber
  );

  const destClient = getClient(destinationChainId);
  const destNonce = await destClient.getTransactionCount({
    address: recipient,
    blockTag: "latest",
  });
  // A nonzero nonce doesn't confirm the bridge mint/claim arrived, only that
  // the address is active on the destination chain. Weak signal only.
  const destinationActivityDetected = destNonce > 0;

  let status: BridgeStatus;
  let note: string;

  if (minutesSinceSourceConfirmed === null) {
    status = "unknown";
    note = "Source tx confirmed but its block timestamp couldn't be read.";
  } else if (minutesSinceSourceConfirmed < IN_TRANSIT_GRACE_MINUTES) {
    status = "in_transit";
    note = `Source tx confirmed ${minutesSinceSourceConfirmed}m ago — still within the normal transfer window. Funds are likely in transit.`;
  } else if (destinationActivityDetected) {
    status = "likely_completed";
    note = `Source tx confirmed ${minutesSinceSourceConfirmed}m ago and the destination address shows activity — the transfer has likely completed. This isn't a confirmed mint/claim match, just a corroborating signal.`;
  } else {
    status = "stuck";
    note = `Source tx confirmed ${minutesSinceSourceConfirmed}m ago with no destination activity detected. This may mean the transfer needs a manual claim on the destination chain, or is genuinely stuck — check the bridge UI for a pending claim before assuming it's lost.`;
  }

  return {
    sourceChainId,
    destinationChainId,
    sourceTx,
    status,
    minutesSinceSourceConfirmed,
    destinationActivityDetected,
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
