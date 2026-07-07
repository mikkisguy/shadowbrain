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

// ── Re-exports for backwards compatibility ────────────────────
// These moved to dedicated files but the public API surface stays the same.

export {
  RATE_LIMIT_LOGIN_MAX,
  RATE_LIMIT_LOGIN_WINDOW_MS,
  RATE_LIMIT_API_MAX,
  RATE_LIMIT_API_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX,
  RATE_LIMIT_DEFAULT_WINDOW_MS,
} from "./rate-limit.config";

export { SSRF_POLICY } from "./ssrf-policy.config";

export {
  CORS_POLICY,
  FORBIDDEN_CORS_HEADERS,
  assertNoCorsHeaders,
} from "./cors.config";

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
  // through /api/bookmarks/image-proxy, which is a same-origin API
  // route — so `'self'` is correct here. The image proxy validates
  // all URLs through the SSRF guard before fetching. `data:` covers
  // inline data URIs (e.g. SVG icons) and `blob:` covers object URLs.
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
