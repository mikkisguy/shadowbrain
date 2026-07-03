/**
 * Next.js Proxy.
 *
 * Replaces the old `src/middleware.ts` file convention (renamed in
 * Next.js 16; see https://nextjs.org/docs/messages/middleware-to-proxy).
 * Proxy runs *before* routes are rendered and is the canonical
 * place to enforce auth + CSRF + redirects for a request. It
 * defaults to the Node.js runtime, but everything in this file
 * uses Web APIs only (Web Crypto, Request/Response, URL) so it
 * would also work on the Edge runtime if the project ever
 * switches.
 *
 * Responsibilities, in order:
 *
 *  1. **Static assets** — pass through immediately.
 *  2. **Rate limit** — per-IP token bucket (per the App Security
 *     Baseline design spec §5). The login route uses the strict
 *     ≈5 / 15 min / IP bucket; every other `/api/…` route uses
 *     ≈120 / min / IP; every other (page) route uses ≈600 / min /
 *     IP. Returns 429 + `Retry-After` when the bucket is empty.
 *  3. **Exempt routes** (`/login`, `/api/auth/*`) — allow
 *     unauthenticated access. The CSRF check is also skipped for
 *     these (the login form is the legitimate entry point).
 *  4. **CSRF** — for state-changing methods, require a matching
 *     `Origin` or `Referer`. Mismatch → 403.
 *  5. **Auth** — read and verify the session cookie. No cookie or
 *     expired/invalid cookie:
 *      - **Browser navigation** → 302 redirect to `/login?from=…`
 *      - **API call** → 401 JSON
 *  6. **Sliding renewal** — when the verified session is past
 *     50% of its lifetime, attach a fresh `Set-Cookie` to the
 *     response.
 *
 * On every non-static response (exempt routes, protected success,
 * 401, 403, 429, 302 redirect), the proxy also applies the
 * **security response headers** (CSP with a per-request nonce,
 * HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
 * Permissions-Policy). The policy is defined in one place —
 * `src/lib/security.config.ts` — and applied uniformly so the
 * defense is the same on every code path. See that file for the
 * full rationale.
 *
 * The exempt list is matched by **exact normalized pathname** — not
 * by suffix or prefix. See `src/lib/auth/exempt-paths.ts`.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import {
  buildSessionCookie,
  getSessionMaxAge,
  readSessionFromRequest,
  signSessionValue,
} from "@/lib/auth/session";
import { checkCsrfOrigin, deriveAllowedOrigin } from "@/lib/auth/csrf";
import { getClientIp } from "@/lib/auth/client-ip";
import {
  isBrowserNavigation,
  isExemptFromAuth,
  isStaticAsset,
} from "@/lib/auth/exempt-paths";
import { applySecurityHeaders, generateNonce } from "@/lib/security.config";
import {
  buildRateLimitResponse,
  checkRateLimitForPath,
  getRateLimitCategory,
} from "@/lib/rate-limit";

export const config = {
  matcher: [
    // Match every request that is NOT:
    //   - a framework-managed static asset (`/_next/...`)
    //   - an exact path like `/favicon.ico` (served from `public/`)
    //   - any file with a static-file extension
    //     (matched by the same `STATIC_FILE_PATTERN` used by
    //     `isStaticAsset` so a typo here cannot widen auth).
    //
    // The regex below excludes:
    //   1. Anything under `/_next/`
    //   2. The literal `favicon.ico`
    //   3. Any path ending in a known static extension
    //
    // We re-check `isStaticAsset` inside the function as a
    // second-layer guard.
    "/((?!_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|webm|mp4|mp3|ogg|wav|woff2?|ttf|otf|css|js|mjs|map|txt|xml|json|pdf)$).*)",
  ],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Static assets — pass through. The security spec scopes the
  // headers to API and pages (see security.config.ts); static
  // assets are same-origin cacheable resources and do not need
  // them. They are also exempt from rate limiting (no point
  // counting a cached image hit).
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // The remaining code paths all return a response that carries
  // the security headers (CSP + static set). Generate a fresh
  // nonce per request — it lands in the CSP `script-src` /
  // `style-src` directives and on the request headers as
  // `x-nonce` so the layout (and any other RSC) can read it.
  const env = getEnv();
  const isProd = env.NODE_ENV === "production";
  const nonce = generateNonce();

  // 1a. E2E mode — bypass auth, CSRF, and rate limiting so
  // AI agents and e2e tests can interact with the app directly
  // without managing session cookies. This branch is only
  // reachable when the app is started with NODE_ENV=e2e
  // (see e2e/ and playwright.config.ts).
  if (env.NODE_ENV === "e2e") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      nonce,
      !isProd
    );
  }

  // 2. Rate limit — per-IP token bucket. The category is
  // determined by the path; the IP comes from the configured
  // trusted-proxy header. The check happens before auth / CSRF
  // so an attacker that exhausts the bucket can never reach the
  // bcrypt / session-verify code paths.
  const ip = getClientIp(request, { header: env.TRUSTED_PROXY_HEADER });
  const rateLimit = checkRateLimitForPath(pathname, ip);
  if (!rateLimit.allowed) {
    log("warn", "rate-limit.exceeded", {
      event: "rate-limit.exceeded",
      category: getRateLimitCategory(pathname),
      pathname,
      ip,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    return applySecurityHeaders(
      buildRateLimitResponse(rateLimit),
      nonce,
      !isProd
    );
  }

  // 3. Exempt routes — allow without auth or CSRF.
  if (isExemptFromAuth(pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    return applySecurityHeaders(response, nonce, !isProd);
  }

  // From this point on, we are on a protected route.

  // 4. CSRF — state-changing methods need a matching Origin/Referer.
  const allowedOrigin = deriveAllowedOrigin(env.DOMAIN, isProd);
  const csrf = checkCsrfOrigin(request, { allowedOrigin });
  if (!csrf.allowed) {
    // Generic 403 — never leak the specific reason to the client.
    const response = new NextResponse(
      JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden" } }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
    return applySecurityHeaders(response, nonce, !isProd);
  }

  // 5. Auth — verify session cookie. Pass the configured
  // `maxAgeMs` so the sliding-renewal threshold is 50% of the
  // actual lifetime, not the default.
  const maxAgeMs = getSessionMaxAge(env.SESSION_MAX_AGE);
  const verify = await readSessionFromRequest(
    request,
    env.SESSION_SECRET,
    maxAgeMs
  );
  if (!verify.ok) {
    if (isBrowserNavigation(request)) {
      // Browser navigation: redirect to the login page, preserving
      // the requested path so the login page can bounce back after
      // a successful login.
      //
      // We do NOT pre-encode the value here — `searchParams.set`
      // percent-encodes its argument, and double-encoding would
      // survive one round of `URLSearchParams` decoding on the
      // login page but produce `%252F`-style escapes in the
      // visible URL.
      const from = pathname + request.nextUrl.search;
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", from);
      const response = NextResponse.redirect(loginUrl, 302);
      return applySecurityHeaders(response, nonce, !isProd);
    }
    const response = new NextResponse(
      JSON.stringify({
        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
    return applySecurityHeaders(response, nonce, !isProd);
  }

  // 6. Sliding renewal — if the session is past 50% of its life,
  // attach a fresh Set-Cookie so the user does not have to log in
  // again mid-session.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  if (verify.shouldRenew && verify.session) {
    const value = await signSessionValue({
      username: verify.session.username,
      secret: env.SESSION_SECRET,
      maxAgeMs,
    });
    const setCookie = buildSessionCookie(value, maxAgeMs, isProd);
    response.headers.append("Set-Cookie", setCookie);
  }

  return applySecurityHeaders(response, nonce, !isProd);
}
