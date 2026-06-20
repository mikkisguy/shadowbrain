/**
 * Module-singleton rate limiter for the login endpoint.
 *
 * The auth module exports a single `loginRateLimiter` instance and
 * a test-only `__resetLoginRateLimiter()` to drop all bucket state
 * between tests. Production code does not need to call the reset.
 */

import { createRateLimiter } from "./rate-limit";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from "./constants";

export const loginRateLimiter = createRateLimiter({
  max: LOGIN_RATE_LIMIT_MAX,
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
});

/** Test-only: drop all stored buckets. Production code should not
 *  call this. */
export function __resetLoginRateLimiter(): void {
  loginRateLimiter.resetAll();
}
