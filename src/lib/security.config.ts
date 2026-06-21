/**
 * Security response-headers policy — the single source of truth for
 * `Content-Security-Policy`, `Strict-Transport-Security`,
 * `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and
 * `Permissions-Policy`.
 *
 * Why one file: the security headers are reviewed together. Splitting
 * them across `next.config.ts`, the proxy, and ad-hoc `headers.append`
 * calls would let a future change weaken one without the reviewer
 * noticing. The whole policy lives here and is applied in one place
 * (`applySecurityHeaders`).
 *
 * Scope per the App Security Baseline design spec
 * (docs/superpowers/specs/2026-06-19-app-security-baseline-design.md
 * §4): API and page responses. Static assets (`_next/static/...`,
 * `/favicon.ico`, `public/*` by extension) are excluded by the proxy
 * matcher and do not receive these headers — they are same-origin
 * cacheable resources, not security-sensitive responses.
 *
 * Threat model: a public-internet attacker reaching the server's
 * port. The headers defend against clickjacking (`X-Frame-Options`,
 * CSP `frame-ancestors`), MIME sniffing (`X-Content-Type-Options`),
 * referrer leakage (`Referrer-Policy`), browser-feature abuse
 * (`Permissions-Policy`), transport downgrade (`HSTS`), and
 * cross-origin script/style injection (`CSP` with nonces, no
 * `unsafe-inline` / `unsafe-eval`).
 */

import type { NextResponse } from "next/server";

/** `Strict-Transport-Security` — 2 years, include subdomains. The
 *  deployment concern (TLS at nginx) is out of scope; the header
 *  itself is set on every response so a future nginx flip to HTTPS
 *  does not require an app change. */
export const HSTS_VALUE = "max-age=63072000; includeSubDomains" as const;

/** `X-Frame-Options: DENY` — defense in depth alongside the CSP
 *  `frame-ancestors 'none'`. Old browsers ignore CSP; this catches
 *  them. */
export const X_FRAME_OPTIONS_VALUE = "DENY" as const;

/** `X-Content-Type-Options: nosniff` — block MIME-sniffing-based
 *  attacks on user-supplied files. */
export const X_CONTENT_TYPE_OPTIONS_VALUE = "nosniff" as const;

/** `Referrer-Policy: strict-origin-when-cross-origin` — send the
 *  origin (not the full URL) on cross-origin requests, and the full
 *  URL on same-origin requests. The default for current browsers is
 *  `strict-origin-when-cross-origin` already, but the header makes
 *  the policy explicit and pins it for older browsers. */
export const REFERRER_POLICY_VALUE = "strict-origin-when-cross-origin" as const;

/** `Permissions-Policy` — opt every powerful browser feature out by
 *  default. The app does not need camera, microphone, or
 *  geolocation. The empty allow-list `()` is the deny-everything
 *  form.
 *
 *  Note: the design spec listed `interest-cohort=()` (the FLoC
 *  opt-out) and we briefly also added `browsing-topics=()` (the
 *  Topics opt-out), but Chrome has since dropped **both** APIs
 *  and modern Chromium logs
 *  `Error with Permissions-Policy header: Unrecognized feature`
 *  for either directive. Sending directives the browser does not
 *  recognize is pure noise — the browser silently ignores them,
 *  and the console is spammed. We therefore ship only the
 *  directives the browser actually understands today. If FLoC /
 *  Topics (or any successor) returns, it can be added back at
 *  that time. */
export const PERMISSIONS_POLICY_VALUE: string = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
].join(", ");

/** Rate-limit policy — per the App Security Baseline design spec
 *  §5. In-memory token-bucket per IP, applied by the proxy
 *  (`src/proxy.ts`):
 *
 *  - **Login** — strict, ≈5 attempts / 15 min / IP. The login route
 *    uses the same bucket as a defense-in-depth check.
 *  - **API** — gentle global limit, ≈120 req / min / IP, for every
 *    route under `/api/` other than `/api/auth/login` (which uses
 *    the stricter login bucket).
 *  - **Default** — broader limit, ≈600 req / min / IP, for every
 *    other (page) route.
 *
 *  The numbers are the spec's "approximately" values. The same
 *  bucket may also be used to derive a `Retry-After` header in
 *  seconds. The values are also exported individually for test
 *  assertions so a future change cannot drift away from the spec
 *  silently.
 */
export const RATE_LIMIT_LOGIN_MAX = 5;
export const RATE_LIMIT_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_API_MAX = 120;
export const RATE_LIMIT_API_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_DEFAULT_MAX = 600;
export const RATE_LIMIT_DEFAULT_WINDOW_MS = 60 * 1000;

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

/** Static security headers — everything except CSP. CSP is built
 *  per-request because it carries a nonce. */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": HSTS_VALUE,
  "X-Frame-Options": X_FRAME_OPTIONS_VALUE,
  "X-Content-Type-Options": X_CONTENT_TYPE_OPTIONS_VALUE,
  "Referrer-Policy": REFERRER_POLICY_VALUE,
  "Permissions-Policy": PERMISSIONS_POLICY_VALUE,
};

/** CSP directives, in the order they appear in the header. Kept as
 *  an array of pre-built strings so the header value is fully
 *  reviewable in one place. The `script-src` and `style-src` entries
 *  include a `${nonce}` placeholder that is filled in by
 *  `buildCspHeader` for each request.
 *
 *  Per the security spec: strict, `'self'`, no `unsafe-inline` /
 *  `unsafe-eval`, block frames / objects, pin `form-action` /
 *  `base-uri` to `'self'`. The dev-only relaxations are added by
 *  `buildCspHeader` when `isDev` is true, not baked into the base
 *  policy, so the production policy is a single readable line per
 *  directive. */
const CSP_DIRECTIVE_TEMPLATES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' 'nonce-${nonce}' 'strict-dynamic'",
  "style-src 'self' 'nonce-${nonce}'",
  // External images (OpenGraph, bookmark thumbnails) are served
  // through /_next/image, which is a static-asset route and outside
  // CSP scope — so `'self'` is correct here. If a future change
  // ever renders an <img> with a raw external src, it will be
  // blocked by this directive. `data:` covers inline data URIs
  // (e.g. SVG icons) and `blob:` covers object URLs.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

/** Dev-only relaxation for `script-src` (webpack / Next.js HMR —
 *  `'unsafe-eval'` is required by the RSC client and the HMR
 *  runtime). It is **never** included in the production policy.
 *  Note: `'unsafe-eval'` is *not* ignored when a nonce is present
 *  in `script-src` (unlike `'unsafe-inline'` in `style-src` — see
 *  `DEV_STYLE_SRC_VALUE`), so the two can coexist. */
const DEV_SCRIPT_SRC_RELAXATION = " 'unsafe-eval'";

/** Dev-only replacement for `style-src`. The Next.js dev overlay
 *  (`devtool-style-inject.js`), the dev-time re-injection of
 *  `next/font` styles (`font-styles.tsx`), and React 19's
 *  hydration-mismatch recovery all inject inline `<style>` tags
 *  **client-side** after the initial server-rendered HTML is in
 *  the DOM. Those client-side injections never see the
 *  server-rendered nonce, so they would be blocked by a strict
 *  nonce-only `style-src`.
 *
 *  Per CSP3, when a `'nonce-...'` source is present in a directive,
 *  the browser **ignores** any `'unsafe-inline'` source in the
 *  same directive. So `style-src 'self' 'nonce-…' 'unsafe-inline'`
 *  would still block the dev overlay's un-nonced injections. The
 *  only mechanism that allows them in dev is to **drop the nonce
 *  and use `'unsafe-inline'` alone**. That is what this dev value
 *  does. Production keeps the strict nonce-only directive (see
 *  `CSP_DIRECTIVE_TEMPLATES`). */
const DEV_STYLE_SRC_VALUE = "style-src 'self' 'unsafe-inline'";

/** Build the full `Content-Security-Policy` header value for a
 *  given nonce. The nonce is interpolated into `script-src` and
 *  `style-src`; everywhere else, the policy is static.
 *
 *  In production, the policy has no `unsafe-inline` and no
 *  `unsafe-eval` — the framework's server-rendered inline
 *  `<style>` tags are nonce-attached automatically, so the strict
 *  nonce-only `style-src` is enough.
 *
 *  In development, `'unsafe-eval'` is added to `script-src` for
 *  the RSC client and HMR runtime, and the **nonce is dropped
 *  from `style-src`** in favor of `'unsafe-inline'`. The
 *  relaxation is needed because Next.js's dev overlay, the
 *  client-side re-injection of `next/font` styles, and React's
 *  hydration-mismatch recovery all inject inline `<style>` tags
 *  client-side after the page has loaded, and those injections
 *  cannot carry a per-request nonce. (The relaxation is scoped
 *  to `style-src`; `script-src` keeps the nonce.) */
export function buildCspHeader(nonce: string, isDev: boolean): string {
  if (!nonce) {
    throw new Error("buildCspHeader: nonce is required");
  }
  return CSP_DIRECTIVE_TEMPLATES.map((d) => {
    if (d.startsWith("script-src ")) {
      const base = d.replace("${nonce}", nonce);
      return isDev ? base + DEV_SCRIPT_SRC_RELAXATION : base;
    }
    if (d.startsWith("style-src ")) {
      // CSP3 quirk: a nonce + 'unsafe-inline' in the same
      // directive does NOT relax inline styles — the browser
      // ignores 'unsafe-inline' when a nonce is present. So in
      // dev we replace the directive entirely; in prod we keep
      // the nonce-only directive for defense in depth.
      if (isDev) return DEV_STYLE_SRC_VALUE;
      return d.replace("${nonce}", nonce);
    }
    if (d.includes("${nonce}")) {
      return d.replace("${nonce}", nonce);
    }
    return d;
  }).join("; ");
}

/** Apply every security response header — both the static set
 *  (`HSTS`, `X-Frame-Options`, …) and the per-request CSP — to
 *  `response`, returning the same `NextResponse` for chaining.
 *
 *  The helper is safe to call on any `NextResponse` shape:
 *  `NextResponse.next()`, `NextResponse.redirect(...)`, or a
 *  freshly-constructed `new NextResponse(body, init)`. The
 *  proxy calls it on every return path so the headers are
 *  uniform — 200, 401, 403, and 302 all carry the same policy.
 *
 *  `set` is used (not `append`) so an already-set value is
 *  overwritten rather than duplicated, in case the framework
 *  set a default. */
export function applySecurityHeaders(
  response: NextResponse,
  nonce: string,
  isDev: boolean
): NextResponse {
  const csp = buildCspHeader(nonce, isDev);
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/** Generate a CSP nonce for a single request.
 *
 *  Uses `crypto.getRandomValues` (Web Crypto, available in both
 *  Node.js ≥ 19 and the Edge runtime) to draw 16 bytes, then
 *  base64-encodes them. 16 bytes (128 bits) is the OWASP
 *  recommendation for cryptographic nonces: enough entropy to
 *  make guessing infeasible, small enough to fit comfortably in
 *  a header.
 *
 *  The result is base64 (not base64url) — base64 is what every
 *  Next.js example and the official docs use, and the value
 *  appears only in an HTTP header and a `'nonce-…'` directive
 *  (no path / cookie / filesystem context where `+/=` would be
 *  problematic). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
