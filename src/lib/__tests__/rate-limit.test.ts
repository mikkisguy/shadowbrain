/**
 * Unit tests for the shared rate-limit module.
 *
 * The three limiters (login / api / default) are the single source
 * of truth for the global rate-limit policy. The proxy reads from
 * them on every non-static request and the login route also reads
 * the login limiter as a defense-in-depth check. These tests pin:
 *
 *  - the configured values (so a future edit cannot drift away
 *    from the security spec silently),
 *  - the category resolution,
 *  - the response shape (429 + `Retry-After`),
 *  - and the cross-bucket isolation (a request against `/api/items`
 *    must not consume a token from the login bucket and vice
 *    versa).
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  __resetAllRateLimiters,
  buildRateLimitResponse,
  checkRateLimitForPath,
  getRateLimitCategory,
  loginRateLimiter,
  resetLoginRateLimit,
} from "../rate-limit";
import {
  RATE_LIMIT_API_MAX,
  RATE_LIMIT_API_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX,
  RATE_LIMIT_DEFAULT_WINDOW_MS,
  RATE_LIMIT_LOGIN_MAX,
  RATE_LIMIT_LOGIN_WINDOW_MS,
} from "../security.config";

describe("rate-limit policy values (security.config.ts)", () => {
  it("login limit is ≈5 attempts / 15 minutes", () => {
    expect(RATE_LIMIT_LOGIN_MAX).toBe(5);
    expect(RATE_LIMIT_LOGIN_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it("api limit is ≈120 requests / minute", () => {
    expect(RATE_LIMIT_API_MAX).toBe(120);
    expect(RATE_LIMIT_API_WINDOW_MS).toBe(60 * 1000);
  });

  it("default (page) limit is ≈600 requests / minute", () => {
    expect(RATE_LIMIT_DEFAULT_MAX).toBe(600);
    expect(RATE_LIMIT_DEFAULT_WINDOW_MS).toBe(60 * 1000);
  });
});

describe("getRateLimitCategory", () => {
  it("maps /api/auth/login to the strict login bucket", () => {
    expect(getRateLimitCategory("/api/auth/login")).toBe("login");
  });

  it("maps every other /api/* path to the api bucket", () => {
    expect(getRateLimitCategory("/api/items")).toBe("api");
    expect(getRateLimitCategory("/api/items/123")).toBe("api");
    expect(getRateLimitCategory("/api/auth/logout")).toBe("api");
    expect(getRateLimitCategory("/api/search")).toBe("api");
  });

  it("maps page paths to the default bucket", () => {
    expect(getRateLimitCategory("/")).toBe("default");
    expect(getRateLimitCategory("/items/123")).toBe("default");
    expect(getRateLimitCategory("/login")).toBe("default");
    expect(getRateLimitCategory("/settings")).toBe("default");
  });

  it("never matches /api/auth/login by prefix (suffix-collision guard)", () => {
    // A future route that *contains* /api/auth/login in its path
    // must NOT be bucketed as the login bucket — the rule is
    // exact-pathname equality, mirroring the CSRF exempt-list
    // discipline in `exempt-paths.ts`.
    expect(getRateLimitCategory("/api/auth/login/callback")).toBe("api");
  });
});

describe("checkRateLimitForPath", () => {
  beforeEach(() => {
    __resetAllRateLimiters();
  });

  it("uses the strict login bucket for /api/auth/login", () => {
    const ip = "1.1.1.1";
    for (let i = 0; i < RATE_LIMIT_LOGIN_MAX; i++) {
      expect(checkRateLimitForPath("/api/auth/login", ip).allowed).toBe(true);
    }
    const blocked = checkRateLimitForPath("/api/auth/login", ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("uses the api bucket for other /api/* paths", () => {
    const ip = "2.2.2.2";
    // Burn the api bucket (it's 120 — much more than 5).
    for (let i = 0; i < RATE_LIMIT_API_MAX; i++) {
      expect(checkRateLimitForPath("/api/items", ip).allowed).toBe(true);
    }
    expect(checkRateLimitForPath("/api/items", ip).allowed).toBe(false);
  });

  it("uses the default bucket for page paths", () => {
    const ip = "3.3.3.3";
    for (let i = 0; i < RATE_LIMIT_DEFAULT_MAX; i++) {
      expect(checkRateLimitForPath("/items/123", ip).allowed).toBe(true);
    }
    expect(checkRateLimitForPath("/items/123", ip).allowed).toBe(false);
  });

  it("isolates the three buckets (login hit does not block api)", () => {
    const ip = "4.4.4.4";
    // Burn the login bucket.
    for (let i = 0; i < RATE_LIMIT_LOGIN_MAX; i++) {
      checkRateLimitForPath("/api/auth/login", ip);
    }
    expect(checkRateLimitForPath("/api/auth/login", ip).allowed).toBe(false);
    // Same IP on a different category still has full quota.
    expect(checkRateLimitForPath("/api/items", ip).allowed).toBe(true);
    expect(checkRateLimitForPath("/items/123", ip).allowed).toBe(true);
  });

  it("isolates buckets per IP", () => {
    for (let i = 0; i < RATE_LIMIT_LOGIN_MAX; i++) {
      checkRateLimitForPath("/api/auth/login", "5.5.5.5");
    }
    expect(checkRateLimitForPath("/api/auth/login", "5.5.5.5").allowed).toBe(
      false
    );
    expect(checkRateLimitForPath("/api/auth/login", "6.6.6.6").allowed).toBe(
      true
    );
  });
});

describe("buildRateLimitResponse", () => {
  it("returns 429 with a generic error body and a Retry-After header", () => {
    const res = buildRateLimitResponse({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("includes only a generic error code and message (no internal detail)", async () => {
    const res = buildRateLimitResponse({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    // Generic message — the App Security Baseline design spec
    // requires rate-limit responses not to echo internal paths,
    // DB errors, or stack traces.
    expect(body.error.message).not.toMatch(/[/\\]/);
    expect(body.error.message).not.toMatch(/at .*\.ts:\d+/);
  });

  it("clamps Retry-After to at least 1 second", () => {
    // The bucket rounds the wait up to whole seconds, so a blocked
    // request always reports at least 1s. A caller that
    // (incorrectly) passes `retryAfterSeconds: 0` must still get a
    // valid `Retry-After` header.
    const res = buildRateLimitResponse({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 0,
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });
});

describe("resetLoginRateLimit", () => {
  beforeEach(() => {
    __resetAllRateLimiters();
  });

  it("clears the bucket for a single IP", () => {
    const ip = "7.7.7.7";
    for (let i = 0; i < RATE_LIMIT_LOGIN_MAX; i++) {
      loginRateLimiter.check(ip);
    }
    expect(loginRateLimiter.check(ip).allowed).toBe(false);
    resetLoginRateLimit(ip);
    expect(loginRateLimiter.check(ip).allowed).toBe(true);
  });

  it("is a no-op for IPs that have no bucket yet", () => {
    // Defensive: should not throw, should not affect other IPs.
    const ip = "8.8.8.8";
    expect(() => resetLoginRateLimit(ip)).not.toThrow();
    expect(loginRateLimiter.check(ip).allowed).toBe(true);
  });
});
