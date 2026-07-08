import { createPublicClient, fallback, http, type PublicClient } from "viem";
import {
  getChain,
  SUPPORTED_CHAINS,
  X_LAYER_MAINNET_ID,
  X_LAYER_TESTNET_ID,
  ETHEREUM_MAINNET_ID,
} from "./chains.js";

const clientCache = new Map<number, PublicClient>();

/**
 * viem's built-in xLayer/xLayerTestnet chain defs default to
 * xlayerrpc.okx.com / xlayertestrpc.okx.com. Some network environments
 * (this dev sandbox included) block okx.com domains outright, so
 * rpc.xlayer.tech is the primary transport. The okx.com endpoint is kept as
 * a fallback rather than dropped — it's a real, working endpoint in
 * environments that aren't blocking it, and gives the client somewhere to
 * fail over to if rpc.xlayer.tech has an outage (part of the "RPC
 * timeout/rate limit" failure surface Phase 2 has to handle).
 *
 * Ethereum mainnet needed the same treatment for a different reason,
 * confirmed live: viem's own default (eth.merkle.io) started returning a
 * Cloudflare rate-limit error ("error code: 1015") partway through testing
 * this project, with no fallback configured at all — meaning any
 * wrong-network cross-chain lookup would silently degrade. Verified these
 * two respond with real JSON-RPC results (not just HTTP 200 — ankr.com's
 * public endpoint, for comparison, returns HTTP 200 with an "Unauthorized"
 * JSON-RPC error body, which looks fine at a glance but isn't).
 */
/**
 * Per Phase 2 spec section 1a: an operator can override the RPC endpoint
 * for either production chain via environment variable (e.g. to point at a
 * paid Alchemy/Infura/OnchainOS URL instead of a public one). If set, the
 * env-var URL is tried first; the known-good public endpoints below are
 * kept as fallbacks so we still ride through an operator-supplied endpoint
 * outage instead of hard-failing.
 */
function withEnvOverride(envVar: string, defaults: string[]): string[] {
  const override = process.env[envVar]?.trim();
  return override ? [override, ...defaults] : defaults;
}

const RPC_ENDPOINTS: Record<number, string[]> = {
  [ETHEREUM_MAINNET_ID]: withEnvOverride("ETH_MAINNET_RPC", [
    "https://ethereum.publicnode.com",
    "https://eth.drpc.org",
  ]),
  [X_LAYER_MAINNET_ID]: withEnvOverride("XLAYER_MAINNET_RPC", [
    "https://rpc.xlayer.tech",
    "https://xlayerrpc.okx.com",
  ]),
  [X_LAYER_TESTNET_ID]: withEnvOverride("XLAYER_TESTNET_RPC", [
    "https://testrpc.xlayer.tech/terigon",
    "https://xlayertestrpc.okx.com/terigon",
  ]),
};

/**
 * Confirmed live: without explicit bounds, a single "transaction not found"
 * lookup against rpc.xlayer.tech took 48+ seconds (viem's defaults —
 * ~10s timeout x 3 retries, then repeated again against the fallback
 * endpoint — compound badly on a slow/rate-limited RPC). A user pasting a
 * mistyped hash shouldn't wait a minute to hear "not found." Each endpoint
 * gets one real attempt plus one quick retry, not three.
 */
const HTTP_TIMEOUT_MS = 6_000;
const HTTP_RETRY_COUNT = 1;
const HTTP_RETRY_DELAY_MS = 300;

/** Returns a cached viem PublicClient for the given chain id. */
export function getClient(chainId: number): PublicClient {
  const cached = clientCache.get(chainId);
  if (cached) return cached;

  const chain = getChain(chainId);
  const endpoints = RPC_ENDPOINTS[chainId];
  const httpOptions = {
    timeout: HTTP_TIMEOUT_MS,
    retryCount: HTTP_RETRY_COUNT,
    retryDelay: HTTP_RETRY_DELAY_MS,
  };
  const transport = endpoints
    ? fallback(endpoints.map((url) => http(url, httpOptions)))
    : http(undefined, httpOptions); // chains without a known-good override just use viem's default RPC

  const client = createPublicClient({ chain, transport });
  clientCache.set(chainId, client);
  return client;
}

export function allSupportedChainIds(): number[] {
  return Object.keys(SUPPORTED_CHAINS).map(Number);
}
