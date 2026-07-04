import { xLayer, xLayerTestnet, mainnet, type Chain } from "viem/chains";

/**
 * Chains the reader knows how to talk to. Kept deliberately small: X Layer
 * is the primary target, Ethereum mainnet is included so the "wrong
 * network" failure mode can check whether a hash the user expected on
 * X Layer actually landed on Ethereum instead (the most common mix-up).
 */
export const SUPPORTED_CHAINS: Record<number, Chain> = {
  [xLayer.id]: xLayer,
  [xLayerTestnet.id]: xLayerTestnet,
  [mainnet.id]: mainnet,
};

export const X_LAYER_MAINNET_ID = xLayer.id; // 196
export const X_LAYER_TESTNET_ID = xLayerTestnet.id; // 1952
export const ETHEREUM_MAINNET_ID = mainnet.id; // 1

export function getChain(chainId: number): Chain {
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain id: ${chainId}`);
  }
  return chain;
}
