import type { NextResponse } from "next/server";

/** CORS posture — per the App Security Baseline design spec §6.
 *
 *  The web UI is same-origin, so the app **never** sets any
 *  `Access-Control-*` response header. The browser refuses
 *  cross-origin XHR/fetch to a same-origin endpoint by default,
 *  and the CSRF origin check (`src/lib/auth/csrf.ts`, owned by
 *  #53) already rejects state-changing requests whose Origin /
 *  Referer does not match the app's configured origin. The CORS
 *  posture and the CSRF posture are intentionally the same
 *  posture stated two ways: same-origin only.
 *
 *  `CORS_POLICY` pins the posture as data so a test (and a
 *  future reviewer) can read it without parsing prose.
 *
 *  ## Future CORS need
 *
 *  If a future feature ever needs cross-origin access (a
 *  separate mobile client, a local script, a browser extension,
 *  etc.), it MUST be added by:
 *
 *    1. Extending this file with an **explicit, tight
 *       allowlist** of origins. A wildcard `*` is **forbidden**
 *       — `allowlistOnly` is `true` for a reason.
 *    2. Adding the response headers via `applySecurityHeaders`
 *       so the policy stays in one reviewed place. Do not set
 *       `Access-Control-Allow-Origin` from a route handler,
 *       `next.config.ts`, or any other file.
 *    3. Keeping the CSRF origin check for state-changing
 *       methods. CORS is **not** a CSRF defense — the origin
 *       check is.
 *
 *  Reviewed in: issue #57 (CORS hardening + centralized
 *  security config). The single source of truth for CORS is
 *  this file. */
export const CORS_POLICY = {
  /** True. The app does not set `Access-Control-Allow-Origin`
   *  and does not allow cross-origin browser requests. */
  sameOriginOnly: true,
  /** True. Any future CORS configuration must use an explicit
   *  allowlist. Wildcard origins are forbidden. */
  allowlistOnly: true,
} as const;

/** The set of CORS-related headers that must NEVER appear on
 *  any response from this app. The app is same-origin only, so
 *  any of these is a regression. `assertNoCorsHeaders` checks a
 *  `NextResponse` against this list, and the security.config
 *  test pins the list itself so a future careless edit cannot
 *  silently drop a header from the invariant.
 *
 *  The list covers every standard `Access-Control-*` response
 *  header defined by the Fetch spec that a server would set in
 *  response to a cross-origin request. The two
 *  `Access-Control-Request-*` headers are technically *request*
 *  headers (sent by the browser in a preflight `OPTIONS`
 *  request), but they are included here as defense-in-depth: a
 *  server should never echo them as response headers, so their
 *  presence on a response would indicate a deeply misconfigured
 *  middleware or a confused proxy. The marginal cost of the
 *  check is zero.
 *
 *  Intentionally excluded (not CORS headers, no security or
 *  correctness benefit at the same origin):
 *  - `Vary: Origin` — a caching directive; for a same-origin
 *    app it is pure overhead (reduces cache efficiency with no
 *    benefit).
 *  - `Timing-Allow-Origin` (Resource Timing Level 2) — controls
 *    timing-data exposure for cross-origin consumers; this app
 *    has none, and same-origin scripts already have access via
 *    the Performance API. */
export const FORBIDDEN_CORS_HEADERS = [
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
  "Access-Control-Request-Headers",
  "Access-Control-Request-Method",
] as const;

/** Throw if `response` carries any CORS response header. The
 *  app is same-origin only; the presence of any
 *  `Access-Control-*` header is a regression. This helper is
 *  the runtime expression of the `CORS_POLICY` invariant and
 *  the test pin for the "no CORS headers present" acceptance
 *  criterion of issue #57.
 *
 *  The helper is exported so a future code path that builds a
 *  response can call it as a tripwire during development, and
 *  so the test suite can use it to assert the invariant. It is
 *  **not** called from `applySecurityHeaders` because the
 *  static header set is reviewed in one place and adding a
 *  runtime check on every response would be a hot-path cost
 *  for a property the tests already pin at the unit and
 *  integration level. */
export function assertNoCorsHeaders(response: NextResponse): void {
  for (const name of FORBIDDEN_CORS_HEADERS) {
    if (response.headers.has(name)) {
      throw new Error(
        `assertNoCorsHeaders: response sets ${name}; the app is same-origin only. ` +
          `Remove the CORS header. If a future feature needs cross-origin access, ` +
          `add an explicit allowlist to src/lib/security.config.ts and apply it via ` +
          `applySecurityHeaders — do not set Access-Control-* headers from route handlers.`
      );
    }
  }
}
