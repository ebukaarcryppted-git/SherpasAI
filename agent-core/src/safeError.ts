/**
 * Never forward a caught error's raw `.message` to an external caller
 * (browser, Discord/Telegram reply, MCP client). RPC client errors (viem's
 * HttpRequestError/TimeoutError in particular) embed the full request URL
 * in their message — and viem's own sanitizer only strips HTTP Basic-Auth
 * userinfo, NOT path- or query-embedded provider API keys, which is exactly
 * how Alchemy/Infura/OnchainOS-style RPC URLs work. The moment an operator
 * configures a paid RPC provider (the documented, recommended production
 * path — see onchain-reader/src/client.ts), a routine rate-limit/timeout
 * blip leaks that key straight into whatever surface calls this.
 *
 * Use at every external-facing catch block: log the real error server-side
 * (where it's actually actionable), return this fixed fallback for whatever
 * reaches the end user/caller.
 */
export function safeErrorMessage(err: unknown, fallback: string, logContext: string): string {
  console.error(logContext, err);
  return fallback;
}
