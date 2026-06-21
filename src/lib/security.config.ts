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
 *  default. The app does not need camera, microphone, geolocation,
 *  or FLoC/Topics. The empty allow-list `()` is the
 *  deny-everything form. */
export const PERMISSIONS_POLICY_VALUE: string = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "interest-cohort=()",
].join(", ");

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
 *  runtime). It is **never** included in the production policy. */
const DEV_SCRIPT_SRC_RELAXATION = " 'unsafe-eval'";

/** Dev-only relaxation for `style-src` (`'unsafe-inline'`). The
 *  Next.js dev overlay (`devtool-style-inject.js`), the dev-time
 *  re-injection of `next/font` styles (`font-styles.tsx`), and
 *  React 19's hydration-mismatch recovery all inject inline
 *  `<style>` tags **client-side** after the initial server-rendered
 *  HTML is in the DOM. Those client-side injections never see the
 *  server-rendered nonce, so without `'unsafe-inline'` in dev the
 *  browser blocks every overlay font / error boundary / HMR
 *  indicator. (In production, the framework's server-rendered
 *  inline `<style>` tags are nonce-attached automatically, so the
 *  relaxation is not needed.) */
const DEV_STYLE_SRC_RELAXATION = " 'unsafe-inline'";

/** Build the full `Content-Security-Policy` header value for a
 *  given nonce. The nonce is interpolated into `script-src` and
 *  `style-src`; everywhere else, the policy is static.
 *
 *  In production, the policy has no `unsafe-inline` and no
 *  `unsafe-eval`. In development, both relaxations are added:
 *  `'unsafe-eval'` in `script-src` (HMR / RSC payload decoding)
 *  and `'unsafe-inline'` in `style-src` (Next.js dev overlay,
 *  client-side font-style re-injection, React error boundaries).
 *  Without them the dev experience is unusable and there is no
 *  security gain in production. Both relaxations are explicit and
 *  discoverable in this one function. */
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
      const base = d.replace("${nonce}", nonce);
      return isDev ? base + DEV_STYLE_SRC_RELAXATION : base;
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
