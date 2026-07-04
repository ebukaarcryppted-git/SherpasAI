import { getClient, X_LAYER_MAINNET_ID } from "./index.js";

/** Smoke test: confirms we can reach X Layer mainnet via the public RPC. */
async function main() {
  const client = getClient(X_LAYER_MAINNET_ID);
  const [chainId, blockNumber, gasPrice] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
  ]);

  console.log("X Layer mainnet reachable:");
  console.log({ chainId, blockNumber, gasPrice: gasPrice.toString() });
}

main().catch((err) => {
  console.error("onchain-reader smoke test failed:", err);
  process.exitCode = 1;
});
