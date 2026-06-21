/**
 * Unit tests for `src/lib/security.config.ts`.
 *
 * The security policy is reviewed in one place. These tests pin
 * the exact values and the CSP structure so a careless edit cannot
 * silently weaken the policy (e.g. flipping `X-Frame-Options` to
 * `SAMEORIGIN`, dropping a CSP directive, or accidentally
 * re-introducing `unsafe-inline` / `unsafe-eval` in production).
 */

import { describe, it, expect } from "vitest";

import {
  applySecurityHeaders,
  buildCspHeader,
  generateNonce,
  HSTS_VALUE,
  PERMISSIONS_POLICY_VALUE,
  REFERRER_POLICY_VALUE,
  STATIC_SECURITY_HEADERS,
  X_CONTENT_TYPE_OPTIONS_VALUE,
  X_FRAME_OPTIONS_VALUE,
} from "../security.config";

describe("static security header values", () => {
  it("HSTS pins subdomains for 2 years", () => {
    expect(HSTS_VALUE).toBe("max-age=63072000; includeSubDomains");
  });

  it("X-Frame-Options is DENY (clickjacking defense)", () => {
    expect(X_FRAME_OPTIONS_VALUE).toBe("DENY");
  });

  it("X-Content-Type-Options is nosniff (MIME-sniffing defense)", () => {
    expect(X_CONTENT_TYPE_OPTIONS_VALUE).toBe("nosniff");
  });

  it("Referrer-Policy is strict-origin-when-cross-origin", () => {
    expect(REFERRER_POLICY_VALUE).toBe("strict-origin-when-cross-origin");
  });

  it("Permissions-Policy denies camera, microphone, geolocation, FLoC, Topics", () => {
    // `interest-cohort=()` covers the legacy FLoC API (Chrome ≤111);
    // `browsing-topics=()` covers the Topics API (Chrome 115+). Both
    // are sent so that no Chromium version logs an "Unrecognized
    // feature" warning for the deprecated name — and so that the
    // newer one is explicitly opted out of.
    expect(PERMISSIONS_POLICY_VALUE).toBe(
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()"
    );
  });

  it("STATIC_SECURITY_HEADERS is the union of all static headers", () => {
    expect(STATIC_SECURITY_HEADERS).toEqual({
      "Strict-Transport-Security": HSTS_VALUE,
      "X-Frame-Options": X_FRAME_OPTIONS_VALUE,
      "X-Content-Type-Options": X_CONTENT_TYPE_OPTIONS_VALUE,
      "Referrer-Policy": REFERRER_POLICY_VALUE,
      "Permissions-Policy": PERMISSIONS_POLICY_VALUE,
    });
  });
});

describe("buildCspHeader", () => {
  const NONCE = "abc123nonce==";

  it("includes the nonce in script-src and style-src", () => {
    const csp = buildCspHeader(NONCE, false);
    expect(csp).toContain(`'nonce-${NONCE}'`);
    // script-src and style-src each get a nonce
    const nonceMatches = csp.match(/'nonce-[^']+'/g) ?? [];
    expect(nonceMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("uses 'self' for every directive that needs a source", () => {
    const csp = buildCspHeader(NONCE, false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src[^;]*'self'/);
    expect(csp).toMatch(/style-src[^;]*'self'/);
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("denies frames and objects", () => {
    const csp = buildCspHeader(NONCE, false);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("requests secure transport upgrade", () => {
    const csp = buildCspHeader(NONCE, false);
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds 'strict-dynamic' so framework-spawned scripts work", () => {
    // 'strict-dynamic' is the modern nonce companion — it lets
    // scripts created by a nonced script run, which is what
    // Next.js needs for its chunked payload. Without it, a strict
    // policy would break hydration in subtle ways.
    const csp = buildCspHeader(NONCE, false);
    expect(csp).toMatch(/script-src[^;]*'strict-dynamic'/);
  });

  it("never includes 'unsafe-inline' in production", () => {
    const csp = buildCspHeader(NONCE, false);
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it("never includes 'unsafe-eval' in production", () => {
    const csp = buildCspHeader(NONCE, false);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("adds 'unsafe-eval' to script-src in development (HMR / RSC)", () => {
    // The webpack dev server and the RSC client need 'unsafe-eval'.
    // The relaxation is dev-only and explicit, so the production
    // policy remains strict.
    const prod = buildCspHeader(NONCE, false);
    const dev = buildCspHeader(NONCE, true);
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
    // It must land in script-src, not anywhere else.
    const scriptSrc = dev
      .split(";")
      .find((s) => s.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it("drops the nonce from style-src in development (dev overlay, font-styles)", () => {
    // The Next.js dev overlay, the client-side re-injection of
    // next/font styles (font-styles.tsx), and React 19's hydration
    // recovery all inject inline <style> tags after the initial
    // server-rendered HTML is in the DOM. Those client-side
    // injections never see the server-rendered nonce, so without
    // a relaxation in dev the browser blocks every overlay /
    // font / error boundary and the dev experience is unusable.
    //
    // Per CSP3, when a nonce is present in a directive the browser
    // IGNORES any 'unsafe-inline' in the same directive, so
    // `style-src 'self' 'nonce-…' 'unsafe-inline'` would still
    // block the dev overlay's un-nonced injections. The only
    // mechanism that works in dev is to drop the nonce and use
    // 'unsafe-inline' alone. That is what the dev policy does.
    // Production keeps the strict, nonce-only directive.
    const prod = buildCspHeader(NONCE, false);
    const dev = buildCspHeader(NONCE, true);
    // Dev style-src has 'unsafe-inline' and NO nonce.
    const devStyleSrc = dev
      .split(";")
      .find((s) => s.trim().startsWith("style-src"));
    expect(devStyleSrc).toBeDefined();
    expect(devStyleSrc).toContain("'unsafe-inline'");
    expect(devStyleSrc).not.toMatch(/'nonce-/);
    // Prod style-src has the nonce and NO 'unsafe-inline'.
    const prodStyleSrc = prod
      .split(";")
      .find((s) => s.trim().startsWith("style-src"));
    expect(prodStyleSrc).toBeDefined();
    expect(prodStyleSrc).toContain(`'nonce-${NONCE}'`);
    expect(prodStyleSrc).not.toContain("'unsafe-inline'");
    // The dev-only relaxation is scoped to style-src; script-src
    // must keep the nonce in both modes.
    const devScriptSrc = dev
      .split(";")
      .find((s) => s.trim().startsWith("script-src"));
    expect(devScriptSrc).toBeDefined();
    expect(devScriptSrc).toContain(`'nonce-${NONCE}'`);
    expect(devScriptSrc).not.toContain("'unsafe-inline'");
  });

  it("uses different nonces for different requests", () => {
    const csp1 = buildCspHeader("nonce-a", false);
    const csp2 = buildCspHeader("nonce-b", false);
    expect(csp1).not.toBe(csp2);
    expect(csp1).toContain("'nonce-nonce-a'");
    expect(csp2).toContain("'nonce-nonce-b'");
  });

  it("rejects an empty nonce (defense against accidental weakening)", () => {
    // An empty nonce would compile into `'nonce-'` which some
    // parsers treat as a syntax error and others as a wildcard.
    // Either outcome silently weakens the policy, so the builder
    // fails closed.
    expect(() => buildCspHeader("", false)).toThrow();
  });
});

describe("generateNonce", () => {
  it("returns a base64 string of the expected length (16 bytes)", () => {
    const nonce = generateNonce();
    // 16 bytes -> 24-character base64 string (with padding).
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("returns a different nonce on every call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });

  it("produces cryptographically-random values (collision-free across many draws)", () => {
    // Drawing 1000 nonces must not produce a duplicate — if it
    // does, the entropy source is broken.
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateNonce());
    }
    expect(seen.size).toBe(1000);
  });
});

describe("applySecurityHeaders", () => {
  // We need a NextResponse, which is provided by next/server. In
  // unit tests we can construct one with an empty body. The
  // helper mutates the same object, so we can read headers off
  // it directly.
  async function newResponse(): Promise<import("next/server").NextResponse> {
    const { NextResponse } = await import("next/server");
    return new NextResponse("ok", { status: 200 });
  }

  it("sets every static header on the response", async () => {
    const res = await newResponse();
    applySecurityHeaders(res, "test-nonce", false);
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("sets the Content-Security-Policy with the supplied nonce", async () => {
    const res = await newResponse();
    applySecurityHeaders(res, "deadbeef", false);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).not.toBeNull();
    expect(csp).toContain("'nonce-deadbeef'");
  });

  it("does not produce 'unsafe-inline' in production output", async () => {
    const res = await newResponse();
    applySecurityHeaders(res, "n", false);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("does produce 'unsafe-eval' in development output (HMR)", async () => {
    const res = await newResponse();
    applySecurityHeaders(res, "n", true);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
  });

  it("does produce 'unsafe-inline' in style-src in development output (dev overlay)", async () => {
    // The dev overlay's client-side style injections cannot carry
    // the per-request nonce, and per CSP3 a nonce + 'unsafe-inline'
    // in the same directive does NOT relax the policy. So in dev
    // we drop the nonce from style-src and use 'unsafe-inline'
    // alone. See `DEV_STYLE_SRC_VALUE` in security.config.ts.
    const res = await newResponse();
    applySecurityHeaders(res, "n", true);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const styleSrc = csp
      .split(";")
      .find((s) => s.trim().startsWith("style-src"));
    expect(styleSrc).toBeDefined();
    expect(styleSrc).toContain("'unsafe-inline'");
    expect(styleSrc).not.toMatch(/'nonce-/);
  });

  it("returns the same NextResponse for chaining", async () => {
    const res = await newResponse();
    const result = applySecurityHeaders(res, "n", false);
    expect(result).toBe(res);
  });
});
