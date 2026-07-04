/**
 * Thin re-export boundary — the MCP layer never talks to onchain-reader or
 * classify.ts directly, and never reimplements diagnosis logic. Everything
 * the tool needs comes through agent-core's `live.diagnoseLive`, the exact
 * same function Phase 2's website/bots call. If tool behavior and
 * classify.ts ever diverge, that's a bug in this file, not a design choice.
 */
export { live } from "@support-agent-asp/agent-core";
export {
  SUPPORTED_CHAINS,
  X_LAYER_MAINNET_ID,
  X_LAYER_TESTNET_ID,
  ETHEREUM_MAINNET_ID,
} from "@support-agent-asp/onchain-reader";

import { SUPPORTED_CHAINS } from "@support-agent-asp/onchain-reader";

/** Human-readable "chainId (name)" list for error messages — kept in sync automatically since it reads the same registry the reader uses. */
export function listSupportedChains(): string {
  return Object.entries(SUPPORTED_CHAINS)
    .map(([id, chain]) => `${id} (${chain.name})`)
    .join(", ");
}

export function isSupportedChain(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS;
}
