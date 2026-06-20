import { describe, it, expect, beforeEach } from "vitest";

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
