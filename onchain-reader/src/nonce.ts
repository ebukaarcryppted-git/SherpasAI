import type { Hex } from "viem";
import { getClient } from "./client.js";
import type { NonceContext } from "./types.js";

/**
 * Compares latest vs pending transaction counts to detect the "stuck/
 * out-of-order nonce" failure mode: a gap between them means an earlier
 * nonce never confirmed, blocking everything queued behind it.
 */
export async function getNonceContext(
  chainId: number,
  address: Hex,
  txNonce?: number
): Promise<NonceContext> {
  const client = getClient(chainId);

  const [latestNonce, pendingNonce] = await Promise.all([
    client.getTransactionCount({ address, blockTag: "latest" }),
    client.getTransactionCount({ address, blockTag: "pending" }),
  ]);

  return {
    chainId,
    address,
    latestNonce,
    pendingNonce,
    txNonce,
    hasGap: txNonce !== undefined && txNonce > latestNonce,
    hasPendingBacklog: pendingNonce > latestNonce,
  };
}
