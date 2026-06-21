/**
 * Backward-compat re-export.
 *
 * The login rate limiter now lives in `@/lib/rate-limit.ts` alongside
 * the other category limiters, so the proxy and the login route
 * share the **same** `Map` for the login bucket (otherwise the proxy
 * and the route would each have an independent counter, doubling
 * the effective limit).
 *
 * This file is kept as a thin re-export so existing callers
 * (the login route's `resetLoginRateLimit` and the auth tests'
 * `__resetLoginRateLimiter`) keep working without an import path
 * change. New code should import from `@/lib/rate-limit` directly.
 */

export {
  __resetAllRateLimiters as __resetLoginRateLimiter,
  resetLoginRateLimit,
} from "@/lib/rate-limit";
