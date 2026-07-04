import { getClient } from "./client.js";
import type { GasContext } from "./types.js";

/**
 * Compares a tx's gas pricing against current network conditions to detect
 * the "gas too low / underpriced" failure mode.
 */
export async function getGasContext(
  chainId: number,
  tx?: { gasPrice?: bigint; maxFeePerGas?: bigint }
): Promise<GasContext> {
  const client = getClient(chainId);

  const [currentGasPrice, latestBlock] = await Promise.all([
    client.getGasPrice(),
    client.getBlock({ blockTag: "latest" }),
  ]);

  const currentBaseFeePerGas = latestBlock.baseFeePerGas ?? null;
  const effectiveTxPrice = tx?.maxFeePerGas ?? tx?.gasPrice;

  const underpriced =
    effectiveTxPrice !== undefined ? effectiveTxPrice < currentGasPrice : false;

  return {
    chainId,
    currentBaseFeePerGas,
    currentGasPrice,
    txGasPrice: tx?.gasPrice,
    txMaxFeePerGas: tx?.maxFeePerGas,
    underpriced,
  };
}
