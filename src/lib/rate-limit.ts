/**
 * Global in-memory rate limiting — per the App Security Baseline
 * design spec §5.
 *
 * This module is the **shared** home for the three limits the
 * proxy enforces:
 *
 *  - **Login** — strict, ≈5 attempts / 15 min / IP, for
 *    `/api/auth/login`. The proxy is the authoritative layer
 *    (every login request goes through the proxy first). The login
 *    route still imports from here so that on a successful login
 *    it can call `resetLoginRateLimit` and free the bucket — the
 *    route does **not** consume a token of its own (the proxy
 *    already did), so the effective limit is exactly 5.
 *  - **API** — ≈120 req / min / IP, for every route under `/api/`
 *    other than `/api/auth/login`.
 *  - **Default** — ≈600 req / min / IP, for every other (page)
 *    route.
 *
 * Each category uses the existing `createRateLimiter` token-bucket
 * factory from `src/lib/auth/rate-limit.ts`. The factory is
 * process-local, so the buckets reset on process restart — fine for
 * a single VPS with a single Node process. The values come from
 * `security.config.ts` so the policy is reviewed in one place.
 *
 * The proxy calls `checkRateLimitForPath` on every non-static
 * request, before auth / CSRF, so a request that exhausts its
 * bucket never reaches the route handler. When the bucket is empty
 * the helper returns the data needed to build a `429` response with
 * a `Retry-After` header.
 */

import { NextResponse } from "next/server";

import { createRateLimiter, type RateLimitResult } from "@/lib/auth/rate-limit";
import {
  RATE_LIMIT_API_MAX,
  RATE_LIMIT_API_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX,
  RATE_LIMIT_DEFAULT_WINDOW_MS,
  RATE_LIMIT_LOGIN_MAX,
  RATE_LIMIT_LOGIN_WINDOW_MS,
} from "@/lib/security.config";

/** The three rate-limit categories — used internally to pick the
 *  right bucket and exposed for testing. */
export type RateLimitCategory = "login" | "api" | "default";

/** Module-singleton limiters. The Map backing each instance lives
 *  for the lifetime of the Node process. Tests use the `__reset…`
 *  helpers below to drop the state between runs. The
 *  `apiRateLimiter` and `defaultRateLimiter` are not exported —
 *  the proxy and the route go through `checkRateLimitForPath`,
 *  which is the only public surface that needs to know which
 *  bucket a path uses. */
export const loginRateLimiter = createRateLimiter({
  max: RATE_LIMIT_LOGIN_MAX,
  windowMs: RATE_LIMIT_LOGIN_WINDOW_MS,
});

const apiRateLimiter = createRateLimiter({
  max: RATE_LIMIT_API_MAX,
  windowMs: RATE_LIMIT_API_WINDOW_MS,
});

const defaultRateLimiter = createRateLimiter({
  max: RATE_LIMIT_DEFAULT_MAX,
  windowMs: RATE_LIMIT_DEFAULT_WINDOW_MS,
});

/** Test-only: drop every bucket state. Production code should not
 *  call this — the limiters are designed to outlive the request. */
export function __resetAllRateLimiters(): void {
  loginRateLimiter.resetAll();
  apiRateLimiter.resetAll();
  defaultRateLimiter.resetAll();
}

/** Resolve a pathname to its rate-limit category. The login route is
 *  special-cased because it uses a much stricter bucket; every other
 *  `/api/…` route uses the gentle global API limit; everything else
 *  falls through to the default page limit. */
export function getRateLimitCategory(pathname: string): RateLimitCategory {
  if (pathname === "/api/auth/login") return "login";
  if (pathname.startsWith("/api/")) return "api";
  return "default";
}

/** Return the rate-limit result for `pathname` and `ip`. The result
 *  shape is the same as the underlying `RateLimitResult` — the
 *  helper exists so the proxy does not have to know which bucket a
 *  given path uses. */
export function checkRateLimitForPath(
  pathname: string,
  ip: string
): RateLimitResult {
  switch (getRateLimitCategory(pathname)) {
    case "login":
      return loginRateLimiter.check(ip);
    case "api":
      return apiRateLimiter.check(ip);
    case "default":
      return defaultRateLimiter.check(ip);
  }
}

/** Build the 429 `NextResponse` for a rate-limit hit. The body is
 *  a generic JSON error (the spec: "never echo internal paths, DB
 *  errors, or stack traces"); the `Retry-After` header is in
 *  seconds, per RFC 9110. The caller is expected to also apply the
 *  security response headers (CSP, HSTS, …) so the policy is
 *  uniform across 200 / 401 / 403 / 429 / 302.
 *
 *  The caller passes the `RateLimitResult` from a `check()` that
 *  returned `allowed: false`. The function reads the
 *  `retryAfterSeconds` field directly — there is exactly one
 *  call site (the proxy), and it always passes a blocked result. */
export function buildRateLimitResponse(result: RateLimitResult): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, result.retryAfterSeconds)),
      },
    }
  );
}

/** Reset the bucket for `ip` on a successful login. The proxy
 *  itself does not call this — the login route does, so a
 *  legitimate user is not penalised for typos. The helper is
 *  exported so the route can stay agnostic of which module owns
 *  the bucket. */
export function resetLoginRateLimit(ip: string): void {
  loginRateLimiter.reset(ip);
}
