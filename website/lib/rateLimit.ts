/**
 * Minimal in-memory, fixed-window rate limiter. A real multi-instance
 * serverless deployment needs a shared store (Redis/Upstash) since this
 * only sees requests handled by the same warm instance. Still meaningfully
 * raises the bar over the previous "completely unbounded" state, which is
 * the actual gap this closes: every route here calls a live RPC (or, for
 * diagnose-proxy, spends real funds) per request with no cap at all.
 */
const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 5_000; // sweep trigger, not a hard cap on legitimate traffic

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Evicts windows that have already expired, so long-running processes don't leak memory. */
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

/** Best-effort caller IP from standard reverse-proxy headers (Vercel and most hosts set x-forwarded-for). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitResponseInit(result: RateLimitResult): ResponseInit {
  return {
    status: 429,
    headers: result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : undefined,
  };
}
