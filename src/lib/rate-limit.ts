/**
 * In-memory token-bucket rate limiter.
 *
 * Protects auth, generation and sending endpoints. For multi-instance deployments,
 * back this with Redis (`REDIS_URL`) — the public surface (`consume(key, limit, window)`)
 * is identical.
 */

type Bucket = { tokens: number; updatedAt: number };

const globalForLimiter = globalThis as unknown as { __applyPilotRateLimit?: Map<string, Bucket> };
const buckets = globalForLimiter.__applyPilotRateLimit ?? new Map<string, Bucket>();
globalForLimiter.__applyPilotRateLimit = buckets;

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function consume(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, updatedAt: now };
  const refillRate = limit / windowSeconds;
  const elapsedSeconds = (now - bucket.updatedAt) / 1000;
  const tokens = Math.min(limit, bucket.tokens + elapsedSeconds * refillRate);

  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: now });
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((1 - tokens) / refillRate) };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return { allowed: true, remaining: Math.floor(tokens - 1), retryAfterSeconds: 0 };
}

export function reset(key: string) {
  buckets.delete(key);
}

/** Helper that turns a failed check into a 429 response header set. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "x-ratelimit-remaining": String(result.remaining),
    ...(result.allowed ? {} : { "retry-after": String(result.retryAfterSeconds) }),
  };
}
