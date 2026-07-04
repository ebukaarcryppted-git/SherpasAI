import { getClient } from "./client.js";
import { withRetry } from "./retry.js";

/**
 * Finds the block nearest a given unix timestamp — used to read
 * `networkState.baseFeeAtSubmission` (the base fee at the block closest to
 * when a pending tx was originally submitted, per the Phase 2 field-source
 * map). Estimates a starting point from the chain's actual observed block
 * time (not a hardcoded assumption — X Layer's ~1s and Ethereum's ~12s
 * are very different), then refines with a small bounded binary search
 * rather than searching the whole chain from genesis.
 */

const MAX_REFINEMENT_STEPS = 12;

export async function getBlockNumberAtTimestamp(
  chainId: number,
  targetTimestampSeconds: number
): Promise<bigint> {
  const client = getClient(chainId);

  const latestBlock = await withRetry(() => client.getBlock({ blockTag: "latest" }));
  const latestNumber = latestBlock.number;
  const latestTimestamp = Number(latestBlock.timestamp);

  if (targetTimestampSeconds >= latestTimestamp) return latestNumber;

  // Sample a second reference point to estimate this chain's actual block
  // time, rather than assuming one — cheap (one extra call) and much more
  // accurate than a hardcoded constant across chains with very different
  // block times.
  const sampleOffset = latestNumber > BigInt(1000) ? BigInt(1000) : latestNumber / BigInt(2) || BigInt(1);
  const sampleNumber = latestNumber - sampleOffset;
  const sampleBlock = await withRetry(() => client.getBlock({ blockNumber: sampleNumber }));
  const sampleTimestamp = Number(sampleBlock.timestamp);

  const elapsedBlocks = Number(latestNumber - sampleNumber);
  const elapsedSeconds = latestTimestamp - sampleTimestamp;
  const avgBlockTimeSeconds = elapsedSeconds > 0 ? elapsedSeconds / elapsedBlocks : 1;

  const secondsBack = latestTimestamp - targetTimestampSeconds;
  const estimatedBlocksBack = BigInt(Math.max(0, Math.round(secondsBack / avgBlockTimeSeconds)));
  let candidate = latestNumber > estimatedBlocksBack ? latestNumber - estimatedBlocksBack : BigInt(0);

  let low = BigInt(0);
  let high = latestNumber;
  let best = candidate;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let step = 0; step < MAX_REFINEMENT_STEPS; step++) {
    if (candidate < low) candidate = low;
    if (candidate > high) candidate = high;

    const block = await withRetry(() => client.getBlock({ blockNumber: candidate }));
    const ts = Number(block.timestamp);
    const diff = Math.abs(ts - targetTimestampSeconds);

    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }

    if (ts === targetTimestampSeconds) break;

    if (ts < targetTimestampSeconds) {
      low = candidate + BigInt(1);
    } else {
      high = candidate - BigInt(1);
    }

    if (low > high) break;

    // Narrow toward the midpoint of the remaining range for guaranteed
    // convergence, rather than re-estimating from block time again.
    candidate = low + (high - low) / BigInt(2);
  }

  return best;
}

/** Reads the base fee of the block nearest a given unix timestamp — feeds `networkState.baseFeeAtSubmission`. */
export async function getBaseFeeAtTimestamp(
  chainId: number,
  targetTimestampSeconds: number
): Promise<bigint | null> {
  const client = getClient(chainId);
  const blockNumber = await getBlockNumberAtTimestamp(chainId, targetTimestampSeconds);
  const block = await withRetry(() => client.getBlock({ blockNumber }));
  return block.baseFeePerGas ?? null;
}
