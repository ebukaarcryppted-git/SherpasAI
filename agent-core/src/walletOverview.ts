import type { Hex } from "viem";
import { getWalletOverview as readWalletOverview, type WalletOverview } from "@support-agent-asp/onchain-reader";

/** Thin pass-through today; kept as its own module so agent-core owns the wallet-facing API surface (bots/MCP import from here, not onchain-reader directly). */
export async function getWalletSummary(
  chainId: number,
  address: Hex,
  tokens: Hex[] = []
): Promise<WalletOverview> {
  return readWalletOverview(chainId, address, tokens);
}
