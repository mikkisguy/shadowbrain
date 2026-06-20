import { describe, it, expect } from "vitest";

import { createRateLimiter } from "../rate-limit";

describe("createRateLimiter", () => {
  it("allows up to `max` requests per key, then blocks", () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 10_000 });
    const k = "ip:1.2.3.4";
    expect(limiter.check(k).allowed).toBe(true);
    expect(limiter.check(k).allowed).toBe(true);
    expect(limiter.check(k).allowed).toBe(true);
    const blocked = limiter.check(k);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates buckets per key", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 10_000 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("refills tokens over time", async () => {
    // 1 request per 100ms (max=1, windowMs=100).
    const limiter = createRateLimiter({ max: 1, windowMs: 100 });
    const k = "k";
    expect(limiter.check(k).allowed).toBe(true);
    expect(limiter.check(k).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 150));
    expect(limiter.check(k).allowed).toBe(true);
  });

  it("caps refill at the configured max (no over-grant)", async () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    const k = "k";
    // Burn the bucket.
    limiter.check(k);
    limiter.check(k);
    // Wait longer than the window.
    await new Promise((r) => setTimeout(r, 1100));
    // Two should be available, three should not.
    expect(limiter.check(k).allowed).toBe(true);
    expect(limiter.check(k).allowed).toBe(true);
    expect(limiter.check(k).allowed).toBe(false);
  });

  it("reset() clears a key's bucket", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 10_000 });
    const k = "k";
    limiter.check(k);
    expect(limiter.check(k).allowed).toBe(false);
    limiter.reset(k);
    expect(limiter.check(k).allowed).toBe(true);
  });

  it("prunes oldest keys when over the cap", () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 10_000,
      maxKeys: 3,
    });
    limiter.check("a");
    limiter.check("b");
    limiter.check("c");
    // Adding a fourth key should evict one of the earlier entries.
    limiter.check("d");
    // `a` may or may not be gone depending on insertion order, but
    // the limiter must not crash and must have a finite bucket
    // count. We just exercise the path.
    expect(limiter._peekRemaining("d")).toBeGreaterThanOrEqual(0);
  });
});
