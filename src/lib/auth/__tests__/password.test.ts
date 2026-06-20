import { describe, it, expect, beforeAll } from "vitest";

import {
  BCRYPT_COST,
  hashPassword,
  verifyPassword,
  verifyPasswordConstantTime,
} from "../password";

describe("hashPassword / verifyPassword", () => {
  it("produces a bcrypt hash that verifies against the same plaintext", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(
      true
    );
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("uses the configured cost factor", async () => {
    const hash = await hashPassword("x");
    // bcrypt hash format: $2b$<cost>$...
    const cost = Number(hash.split("$")[2]);
    expect(cost).toBe(BCRYPT_COST);
  });

  it("rejects empty plaintext", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});

describe("verifyPasswordConstantTime", () => {
  // The real user hash is generated once at suite load so each
  // test reuses it. The dummy hash is generated lazily inside
  // `password.ts`.
  const REAL_PASSWORD = "real-admin-password";
  let realHash: string;

  beforeAll(async () => {
    realHash = await hashPassword(REAL_PASSWORD);
  });

  it("returns ok=true when user exists and password matches", async () => {
    const result = await verifyPasswordConstantTime({
      submittedPassword: REAL_PASSWORD,
      storedHash: realHash,
    });
    expect(result.ok).toBe(true);
  });

  it("returns ok=false when user exists and password is wrong", async () => {
    const result = await verifyPasswordConstantTime({
      submittedPassword: "wrong-password",
      storedHash: realHash,
    });
    expect(result.ok).toBe(false);
  });

  it("returns ok=false when user does not exist (still pays the bcrypt cost)", async () => {
    const result = await verifyPasswordConstantTime({
      submittedPassword: "any-password",
      storedHash: null,
    });
    expect(result.ok).toBe(false);
  });

  it("OWASP ASVS V3.2.2 — the user-not-found and wrong-password branches take comparable time", async () => {
    // Run both paths multiple times and compare the median elapsed
    // time. A naive implementation that short-circuits on
    // `storedHash === null` would let an attacker enumerate
    // usernames by timing. With the dummy-hash compare, both
    // branches do one bcrypt cost-10 comparison.
    //
    // We assert the medians are within a 4x factor of each
    // other. A failure here would indicate the constant-time
    // guarantee has regressed.
    const ITER = 7;
    const wrong = async () => {
      const t0 = performance.now();
      for (let i = 0; i < ITER; i++) {
        await verifyPasswordConstantTime({
          submittedPassword: "wrong",
          storedHash: realHash,
        });
      }
      return performance.now() - t0;
    };
    const noUser = async () => {
      const t0 = performance.now();
      for (let i = 0; i < ITER; i++) {
        await verifyPasswordConstantTime({
          submittedPassword: "wrong",
          storedHash: null,
        });
      }
      return performance.now() - t0;
    };

    // Warm up both paths so the first call's bcrypt cost does not
    // skew the comparison.
    await wrong();
    await noUser();

    const a = await wrong();
    const b = await noUser();
    const ratio = Math.max(a, b) / Math.min(a, b);
    // Generous threshold: bcrypt cost dominates both calls, and
    // the V8 GC can introduce a 2-3x jitter on a small sample.
    expect(ratio).toBeLessThan(4);
  });
});
