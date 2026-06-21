import { describe, it, expect, beforeEach, vi } from "vitest";

import { cleanupTestDb, createTestDb } from "@/db/test-utils";
import { proxy } from "@/proxy";
import {
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_AGE_MS,
} from "@/lib/auth/constants";
import { signSessionValue } from "@/lib/auth/session";

/**
 * Minimal NextRequest-like object for the Proxy.
 *
 * The Proxy only reads `request.nextUrl.pathname`,
 * `request.nextUrl.search`, `request.url`, `request.method`,
 * `request.headers.get()`, and constructs a `Request` internally.
 * We construct a thin object that satisfies those reads without
 * pulling in the full `next/server` module.
 */
class FakeNextRequest {
  method: string;
  headers: Headers;
  nextUrl: { pathname: string; search: string; origin: string };
  url: string;
  constructor(init: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  }) {
    const u = new URL(init.url);
    this.url = init.url;
    this.method = init.method ?? "GET";
    this.headers = new Headers(init.headers ?? {});
    this.nextUrl = {
      pathname: u.pathname,
      search: u.search,
      origin: u.origin,
    };
  }
  get cookies() {
    return {
      get: (name: string) => {
        const cookieHeader = this.headers.get("cookie");
        if (!cookieHeader) return undefined;
        for (const part of cookieHeader.split(";")) {
          const trimmed = part.trim();
          const eq = trimmed.indexOf("=");
          if (eq <= 0) continue;
          const k = trimmed.slice(0, eq);
          if (k === name) return { name, value: trimmed.slice(eq + 1) };
        }
        return undefined;
      },
    };
  }
}

const SECRET = process.env.SESSION_SECRET ?? "";

async function authedRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {}
) {
  const value = await signSessionValue({
    username: "admin",
    secret: SECRET,
    maxAgeMs: DEFAULT_SESSION_AGE_MS,
  });
  return new FakeNextRequest({
    url,
    method: init.method ?? "GET",
    headers: {
      ...(init.headers ?? {}),
      cookie: `${SESSION_COOKIE_NAME}=${value}`,
    },
  });
}

describe("proxy", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  it("passes through /_next/static (static asset)", async () => {
    const req = new FakeNextRequest({
      url: "http://localhost/_next/static/chunks/foo.js",
    });
    const res = await proxy(req as never);
    // NextResponse.next() returns a response with status 200 by
    // default; we just check the Proxy did not redirect or
    // return 401.
    expect(res.status).toBe(200);
  });

  it("passes through /favicon.ico", async () => {
    const req = new FakeNextRequest({ url: "http://localhost/favicon.ico" });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
  });

  it("allows unauthenticated access to /login", async () => {
    const req = new FakeNextRequest({ url: "http://localhost/login" });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
  });

  it("allows unauthenticated access to /api/auth/login", async () => {
    const req = new FakeNextRequest({
      url: "http://localhost/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
  });

  it("redirects unauthenticated browser requests to /login", async () => {
    const req = new FakeNextRequest({
      url: "http://localhost/items/123",
      headers: { Accept: "text/html" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(decodeURIComponent(location)).toContain("/items/123");
  });

  it("redirects an unauthenticated browser request for / to /login?from=/", async () => {
    // The home page is the only real surface today, so the proxy
    // MUST bounce an unauthenticated visitor off it to the sign-in
    // page (with the intended destination preserved as `from`).
    const req = new FakeNextRequest({
      url: "http://localhost/",
      headers: { Accept: "text/html" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(decodeURIComponent(location)).toContain("from=/");
  });

  it("returns 401 for unauthenticated API requests", async () => {
    const req = new FakeNextRequest({
      url: "http://localhost/api/items",
      headers: { Accept: "application/json" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("allows authenticated browser requests", async () => {
    const req = await authedRequest("http://localhost/items");
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
  });

  it("allows authenticated API requests", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      headers: { Accept: "application/json" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
  });

  it("rejects a state-changing request with a cross-origin Origin (CSRF)", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://attacker.example",
      },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("rejects a state-changing request with a cross-origin Referer", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "http://attacker.example/x",
      },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(403);
  });

  it("rejects a state-changing request with no Origin and no Referer", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(403);
  });

  it("allows a same-origin POST through", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
  });

  it("does not require an Origin on a safe method (GET)", async () => {
    const req = await authedRequest("http://localhost/api/items");
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
  });

  it("does not exempt /api/admin/login by suffix-match", async () => {
    // A future route ending in /login must NOT silently inherit
    // the exempt list — exact-pathname matching is the rule.
    const req = new FakeNextRequest({
      url: "http://localhost/api/admin/login",
    });
    const res = await proxy(req as never);
    // Unauthenticated + not exempt → redirect (or 401, but this
    // path has no Accept header so it defaults to API and 401).
    expect([302, 401]).toContain(res.status);
  });
});

/**
 * Security response headers — the proxy must apply the policy
 * defined in `src/lib/security.config.ts` to every non-static
 * response: 200, 302, 401, 403, exempt routes. The policy is
 * defense in depth, so missing a single code path is a regression.
 */
describe("proxy — security response headers", () => {
  // The proxy reads NODE_ENV to decide whether to add the dev-only
  // `'unsafe-eval'` relaxation. The test runner uses NODE_ENV=test
  // (not 'production'), so by default it sees the dev policy. We
  // also assert the production policy explicitly by spying on
  // `getEnv` in the dedicated test below.
  const TEST_IS_PROD = process.env.NODE_ENV === "production";

  // The full set the proxy is expected to set on every non-static
  // response. Mirrors `STATIC_SECURITY_HEADERS` in security.config.ts
  // and is duplicated here on purpose — if a future change drops a
  // header from the config, this test will fail and the reviewer
  // will see the policy contract change.
  const EXPECTED_STATIC: Readonly<Record<string, string>> = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };

  /** Assert that `res` carries every expected security header
   *  with the right value, and that the CSP uses a non-empty nonce
   *  with no production-only relaxations. `isProd` mirrors the
   *  `NODE_ENV` the proxy saw — production assertions forbid
   *  `'unsafe-eval'`, dev/test assertions require it (HMR). */
  function assertSecurityHeaders(res: { headers: Headers }, isProd: boolean) {
    for (const [name, value] of Object.entries(EXPECTED_STATIC)) {
      expect(res.headers.get(name)).toBe(value);
    }
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).not.toBeNull();
    // A nonce is always present in the header (it's used by
    // script-src, and by style-src in production).
    const nonceMatch = /'nonce-([^']+)'/.exec(csp ?? "");
    expect(nonceMatch).not.toBeNull();
    expect(nonceMatch?.[1]).toBeTruthy();
    if (isProd) {
      // Production: strict, nonce-only. No relaxations anywhere.
      expect(csp).not.toContain("'unsafe-inline'");
      expect(csp).not.toContain("'unsafe-eval'");
      // The nonce must be in both script-src and style-src.
      const styleSrc = (csp ?? "")
        .split(";")
        .find((s) => s.trim().startsWith("style-src"));
      expect(styleSrc).toBeDefined();
      expect(styleSrc).toContain(`'nonce-${nonceMatch?.[1]}'`);
    } else {
      // Dev / test: 'unsafe-eval' in script-src (HMR / RSC).
      expect(csp).toContain("'unsafe-eval'");
      // Dev / test: style-src has 'unsafe-inline' and NO nonce.
      // Per CSP3, a nonce + 'unsafe-inline' in the same directive
      // does NOT relax inline styles (the browser ignores
      // 'unsafe-inline' when a nonce is present), so the only way
      // to allow the dev overlay's client-side style injections
      // is to drop the nonce in dev. Production keeps the nonce.
      const styleSrc = (csp ?? "")
        .split(";")
        .find((s) => s.trim().startsWith("style-src"));
      expect(styleSrc).toBeDefined();
      expect(styleSrc).toContain("'unsafe-inline'");
      expect(styleSrc).not.toMatch(/'nonce-/);
      // And script-src keeps the nonce in both modes.
      const scriptSrc = (csp ?? "")
        .split(";")
        .find((s) => s.trim().startsWith("script-src"));
      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).toContain(`'nonce-${nonceMatch?.[1]}'`);
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    }
  }

  it("applies the full policy to a successful authenticated response", async () => {
    const req = await authedRequest("http://localhost/api/items");
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
    assertSecurityHeaders(res, TEST_IS_PROD);
  });

  it("applies the full policy to an unauthenticated 401 (API)", async () => {
    const req = new FakeNextRequest({
      url: "http://localhost/api/items",
      headers: { Accept: "application/json" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(401);
    assertSecurityHeaders(res, TEST_IS_PROD);
  });

  it("applies the full policy to a CSRF 403", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://attacker.example",
      },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(403);
    assertSecurityHeaders(res, TEST_IS_PROD);
  });

  it("applies the full policy to a 302 redirect to /login (browser nav)", async () => {
    const req = new FakeNextRequest({
      url: "http://localhost/items/123",
      headers: { Accept: "text/html" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(302);
    assertSecurityHeaders(res, TEST_IS_PROD);
  });

  it("applies the full policy to an exempt route (/login)", async () => {
    const req = new FakeNextRequest({ url: "http://localhost/login" });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
    assertSecurityHeaders(res, TEST_IS_PROD);
  });

  it("applies the full policy to an exempt API route (/api/auth/login)", async () => {
    const req = new FakeNextRequest({
      url: "http://localhost/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
    assertSecurityHeaders(res, TEST_IS_PROD);
  });

  it("does NOT include 'unsafe-eval' when NODE_ENV is production", async () => {
    // The dev-only relaxation is the single thing standing
    // between strict CSP and a working `pnpm dev`. We pin the
    // production behaviour explicitly so a future change cannot
    // accidentally relax the production policy. We use
    // `vi.doMock` to swap `getEnv` for this test, so the rest of
    // the suite (and any other test file in the run) is
    // unaffected.
    vi.doMock("@/lib/env", () => ({
      getEnv: () => ({
        NODE_ENV: "production",
        DOMAIN: "localhost:3000",
        SESSION_SECRET: SECRET,
      }),
    }));
    try {
      vi.resetModules();
      const { proxy: prodProxy } = await import("@/proxy");
      const req = await authedRequest("http://localhost/api/items");
      const res = await prodProxy(req as never);
      expect(res.status).toBe(200);
      assertSecurityHeaders(res, true);
    } finally {
      vi.doUnmock("@/lib/env");
      vi.resetModules();
    }
  });

  it("does not apply security headers to static assets (out of spec scope)", async () => {
    // The spec scopes headers to API + pages. Static assets are
    // same-origin cacheable resources and are excluded.
    const req = new FakeNextRequest({
      url: "http://localhost/_next/static/chunks/foo.js",
    });
    const res = await proxy(req as never);
    expect(res.status).toBe(200);
    // Strictly: no Content-Security-Policy on the passthrough. We
    // also assert that the other static headers are absent so a
    // future change cannot quietly start applying them.
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
    expect(res.headers.get("X-Frame-Options")).toBeNull();
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("generates a different CSP nonce for every request", async () => {
    // The whole point of the nonce is per-request uniqueness. A
    // non-random or cached nonce would be a critical regression.
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const req = new FakeNextRequest({
        url: "http://localhost/api/items",
        headers: { Accept: "application/json" },
      });
      const res = await proxy(req as never);
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      const match = /'nonce-([^']+)'/.exec(csp);
      expect(match).not.toBeNull();
      seen.add(match?.[1] ?? "");
    }
    expect(seen.size).toBe(10);
  });

  it("CSP includes the modern security directives (strict-dynamic, frame-ancestors, upgrade-insecure-requests)", async () => {
    const req = await authedRequest("http://localhost/api/items");
    const res = await proxy(req as never);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
});
