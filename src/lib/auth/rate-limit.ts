/**
 * In-memory token-bucket rate limiter.
 *
 * One instance per bucket (e.g. one for the login endpoint, one for
 * global API traffic in #56). Process-local — fine for a single VPS
 * with a single Node process. Resets on process restart, which is
 * acceptable here.
 *
 * The bucket refills at `maxRequests / windowMs` requests per ms.
 * Each successful check consumes one token; rejected checks
 * (over-limit) consume no token but return the remaining time until
 * enough tokens are available.
 *
 * Buckets are keyed by an arbitrary string (typically the client IP
 * or a route-scoped prefix). A periodic prune removes buckets that
 * have been full for a while, so the in-memory state does not grow
 * without bound.
 */

export interface RateLimitBucket {
  /** Remaining tokens. */
  remaining: number;
  /** Absolute ms epoch at which one token will be available again. */
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Tokens remaining after this check (only meaningful when allowed). */
  remaining: number;
  /** Seconds the client should wait before retrying. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Check (and consume) a token for `key`. */
  check(key: string): RateLimitResult;
  /** Reset the bucket for `key` (e.g. after a successful login). */
  reset(key: string): void;
  /** Reset every bucket. Test-only. */
  resetAll(): void;
  /** Test-only: drain a key to its limit. */
  _peekRemaining(key: string): number;
}

export interface RateLimiterOptions {
  /** Maximum number of requests allowed in the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
  /** Maximum number of tracked keys. Older keys are pruned FIFO. */
  maxKeys?: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { max, windowMs } = options;
  const maxKeys = options.maxKeys ?? 10_000;
  // Tokens per ms. We compute it lazily so the limiter does not pay
  // for fractional tokens until needed.
  const tokensPerMs = max / windowMs;
  const buckets = new Map<string, RateLimitBucket>();

  function pruneIfNeeded() {
    if (buckets.size <= maxKeys) return;
    // Remove the oldest entries (Map preserves insertion order).
    const excess = buckets.size - maxKeys;
    const keys = Array.from(buckets.keys()).slice(0, excess);
    for (const k of keys) buckets.delete(k);
  }

  return {
    check(key) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { remaining: max, resetAt: now };
        buckets.set(key, bucket);
        pruneIfNeeded();
      } else {
        // Refill: add (elapsed * tokensPerMs) tokens, capped at `max`.
        const elapsed = Math.max(0, now - bucket.resetAt);
        const refilled = Math.min(
          max,
          bucket.remaining + elapsed * tokensPerMs
        );
        bucket.remaining = refilled;
        bucket.resetAt = now;
      }

      if (bucket.remaining >= 1) {
        bucket.remaining -= 1;
        return {
          allowed: true,
          remaining: Math.floor(bucket.remaining),
          retryAfterSeconds: 0,
        };
      }

      // Time until one full token is available.
      const msUntilOne = Math.ceil((1 - bucket.remaining) / tokensPerMs);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(msUntilOne / 1000)),
      };
    },
    reset(key) {
      buckets.delete(key);
    },
    resetAll() {
      buckets.clear();
    },
    _peekRemaining(key) {
      const bucket = buckets.get(key);
      if (!bucket) return max;
      const now = Date.now();
      const elapsed = Math.max(0, now - bucket.resetAt);
      return Math.min(max, bucket.remaining + elapsed * tokensPerMs);
    },
  };
}
