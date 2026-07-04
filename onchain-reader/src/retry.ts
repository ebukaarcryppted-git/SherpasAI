/**
 * Shared retry/backoff for the RPC failure surface Phase 1 never had to
 * handle: rate limits, transient timeouts, and momentary network errors
 * against a public RPC with no SLA. Not for masking real errors (a genuine
 * revert or a malformed request should still fail fast) — only for the
 * specific transient error shapes public RPCs are known to throw.
 */

const TRANSIENT_ERROR_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /socket hang up/i,
  /fetch failed/i,
  /network/i,
];

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export interface RetryOptions {
  maxAttempts?: number;
  /** base delay in ms; actual delay is baseDelayMs * 2^attempt */
  baseDelayMs?: number;
}

/** Retries `fn` on transient errors with exponential backoff. Rethrows immediately on any non-transient error. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 300;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt >= maxAttempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
      attempt += 1;
    }
  }
}
