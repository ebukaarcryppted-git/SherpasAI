/**
 * Minimal in-memory, fixed-window rate limiter — same pattern as
 * website/lib/rateLimit.ts and sherpas-support-mcp-server/src/rateLimit.ts.
 * Every other live surface in this project caps requests per caller; this
 * bot didn't, even though every command/auto-diagnose reply triggers a real
 * RPC call chain.
 */
const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 5_000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, maxRequestsPerMinute: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= maxRequestsPerMinute) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}
