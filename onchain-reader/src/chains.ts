import { xLayer, xLayerTestnet, mainnet, type Chain } from "viem/chains";

/**
 * Chains the reader knows how to talk to. Ethereum Mainnet and X Layer
 * Mainnet are both first-class targets (Phase 2 spec section 1a) — the
 * classification logic is chain-agnostic, so nothing here should assume
 * one is "primary." The wrong-network cross-chain fallback (Phase 1 spec
 * section 3.1) walks all entries here in parallel.
 *
 * X Layer testnet is kept as a dev-only convenience so contract calls can
 * be exercised without spending real gas; it's not part of the two
 * production chains the specs commit to supporting.
 */
export const SUPPORTED_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [xLayer.id]: xLayer,
  [xLayerTestnet.id]: xLayerTestnet,
};

/**
 * Human-readable metadata for the two production chains, per Phase 2 spec
 * section 1a. Consumers (UI, docs, error messages) should read from here
 * rather than hardcoding "Ethereum" / "X Layer" strings, so a future chain
 * addition is a one-line change here.
 */
export const CHAIN_METADATA: Record<number, { name: string; nativeToken: string }> = {
  [mainnet.id]: { name: "Ethereum Mainnet", nativeToken: "ETH" },
  [xLayer.id]: { name: "X Layer Mainnet", nativeToken: "OKB" },
  [xLayerTestnet.id]: { name: "X Layer Testnet", nativeToken: "OKB" },
};

export const ETHEREUM_MAINNET_ID = mainnet.id; // 1
export const X_LAYER_MAINNET_ID = xLayer.id; // 196
export const X_LAYER_TESTNET_ID = xLayerTestnet.id; // 1952

export function getChain(chainId: number): Chain {
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain id: ${chainId}`);
  }
  return chain;
}
