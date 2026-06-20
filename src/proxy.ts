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
 *  2. **Exempt routes** (`/login`, `/api/auth/*`) — allow
 *     unauthenticated access. The CSRF check is also skipped for
 *     these (the login form is the legitimate entry point).
 *  3. **CSRF** — for state-changing methods, require a matching
 *     `Origin` or `Referer`. Mismatch → 403.
 *  4. **Auth** — read and verify the session cookie. No cookie or
 *     expired/invalid cookie:
 *      - **Browser navigation** → 302 redirect to `/login?from=…`
 *      - **API call** → 401 JSON
 *  5. **Sliding renewal** — when the verified session is past
 *     50% of its lifetime, attach a fresh `Set-Cookie` to the
 *     response.
 *
 * The exempt list is matched by **exact normalized pathname** — not
 * by suffix or prefix. See `src/lib/auth/exempt-paths.ts`.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import {
  buildSessionCookie,
  getSessionMaxAge,
  readSessionFromRequest,
  signSessionValue,
} from "@/lib/auth/session";
import { checkCsrfOrigin, deriveAllowedOrigin } from "@/lib/auth/csrf";
import {
  isBrowserNavigation,
  isExemptFromAuth,
  isStaticAsset,
} from "@/lib/auth/exempt-paths";

export const config = {
  matcher: [
    // Match everything except static asset routes & the favicon.
    // We re-check `isStaticAsset` below so a typo here does not
    // widen auth.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Static assets — pass through.
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // 2. Exempt routes — allow without auth or CSRF.
  if (isExemptFromAuth(pathname)) {
    return NextResponse.next();
  }

  // From this point on, we are on a protected route.

  // 3. CSRF — state-changing methods need a matching Origin/Referer.
  const env = getEnv();
  const isProd = env.NODE_ENV === "production";
  const allowedOrigin = deriveAllowedOrigin(env.DOMAIN, isProd);
  const csrf = checkCsrfOrigin(request, { allowedOrigin });
  if (!csrf.allowed) {
    // Generic 403 — never leak the specific reason to the client.
    return new NextResponse(
      JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden" } }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 4. Auth — verify session cookie. Pass the configured
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
      return NextResponse.redirect(loginUrl, 302);
    }
    return new NextResponse(
      JSON.stringify({
        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 5. Sliding renewal — if the session is past 50% of its life,
  // attach a fresh Set-Cookie so the user does not have to log in
  // again mid-session.
  const response = NextResponse.next();
  if (verify.shouldRenew && verify.session) {
    const value = await signSessionValue({
      username: verify.session.username,
      secret: env.SESSION_SECRET,
      maxAgeMs,
    });
    const setCookie = buildSessionCookie(value, maxAgeMs, isProd);
    response.headers.append("Set-Cookie", setCookie);
  }

  return response;
}
