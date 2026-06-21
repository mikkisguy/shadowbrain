/**
 * Unit tests for `src/lib/auth/client-ip.ts`.
 *
 * The rate limiter and the audit log both use the client IP as a
 * bucketing key. The IP comes from the trusted-proxy header
 * configured in the deployment (default: `X-Forwarded-For`). These
 * tests pin the behavior of the helper:
 *
 *  - default (no options) reads `X-Forwarded-For` then
 *    `X-Real-IP`;
 *  - an explicit `header` option overrides the default;
 *  - the leftmost XFF entry wins (the original client);
 *  - missing / blank headers fall through to `"unknown"` so the
 *    caller can always bucket the request.
 */

import { describe, it, expect } from "vitest";

import { getClientIp } from "../client-ip";

describe("getClientIp", () => {
  it("reads the leftmost X-Forwarded-For entry by default", () => {
    const req = new Request("http://localhost/x", {
      headers: { "X-Forwarded-For": "1.2.3.4, 10.0.0.1, 10.0.0.2" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("strips surrounding whitespace and quotes from XFF entries", () => {
    const req = new Request("http://localhost/x", {
      headers: { "X-Forwarded-For": '  "9.9.9.9"  , 10.0.0.1' },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to X-Real-IP when XFF is absent", () => {
    const req = new Request("http://localhost/x", {
      headers: { "X-Real-IP": "5.5.5.5" },
    });
    expect(getClientIp(req)).toBe("5.5.5.5");
  });

  it("prefers XFF over X-Real-IP when both are present", () => {
    const req = new Request("http://localhost/x", {
      headers: {
        "X-Forwarded-For": "1.1.1.1",
        "X-Real-IP": "5.5.5.5",
      },
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  it("returns 'unknown' when neither header is present", () => {
    const req = new Request("http://localhost/x");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("honors a custom header (e.g. CF-Connecting-IP) via the options argument", () => {
    const req = new Request("http://localhost/x", {
      headers: { "CF-Connecting-IP": "8.8.8.8", "X-Forwarded-For": "1.1.1.1" },
    });
    // When the deployment is configured to trust CF-Connecting-IP,
    // the helper reads only that header — XFF is ignored even if
    // present.
    expect(getClientIp(req, { header: "CF-Connecting-IP" })).toBe("8.8.8.8");
  });

  it("treats the configured header case-insensitively", () => {
    const req = new Request("http://localhost/x", {
      headers: { "cf-connecting-ip": "8.8.8.8" },
    });
    expect(getClientIp(req, { header: "CF-Connecting-IP" })).toBe("8.8.8.8");
  });

  it("returns 'unknown' for an explicit header that is missing", () => {
    const req = new Request("http://localhost/x", {
      headers: { "X-Real-IP": "5.5.5.5" },
    });
    // Deployment says trust CF-Connecting-IP, but the request
    // does not carry it; the helper must NOT silently fall back
    // to X-Real-IP — that would mix deployment contracts.
    expect(getClientIp(req, { header: "CF-Connecting-IP" })).toBe("unknown");
  });
});
