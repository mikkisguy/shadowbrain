import { describe, it, expect } from "vitest";

import { checkCsrfOrigin, deriveAllowedOrigin } from "../csrf";
import { STATE_CHANGING_METHODS } from "../constants";

describe("checkCsrfOrigin", () => {
  it("allows GET (safe method) without an Origin header", () => {
    const req = new Request("http://localhost/api/items", { method: "GET" });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(true);
  });

  it("rejects POST without any Origin or Referer header", () => {
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      body: "{}",
    });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("missing");
  });

  it("accepts a same-origin POST with matching Origin", () => {
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
      body: "{}",
    });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(true);
    expect(result.source).toBe("origin");
  });

  it("rejects a POST with a cross-origin Origin", () => {
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { Origin: "http://attacker.example" },
      body: "{}",
    });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(false);
    expect(result.source).toBe("origin");
  });

  it("accepts a same-origin POST with matching Referer when Origin is absent", () => {
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { Referer: "http://localhost:3000/some/page" },
      body: "{}",
    });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(true);
    expect(result.source).toBe("referer");
  });

  it("rejects a POST with a cross-origin Referer", () => {
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { Referer: "http://attacker.example/x" },
      body: "{}",
    });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(false);
    expect(result.source).toBe("referer");
  });

  it("rejects a POST with a malformed Origin", () => {
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { Origin: "not a url" },
      body: "{}",
    });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(false);
  });

  it("treats Origin preference over Referer", () => {
    // Even if Referer matches, a bad Origin should still reject.
    const req = new Request("http://localhost/api/items", {
      method: "POST",
      headers: {
        Origin: "http://attacker.example",
        Referer: "http://localhost:3000/page",
      },
      body: "{}",
    });
    const result = checkCsrfOrigin(req, {
      allowedOrigin: "http://localhost:3000",
    });
    expect(result.allowed).toBe(false);
  });

  it("checks PATCH and DELETE (and other state-changing methods)", () => {
    for (const m of STATE_CHANGING_METHODS) {
      const req = new Request("http://localhost/api/x", {
        method: m,
        body: "{}",
      });
      const result = checkCsrfOrigin(req, {
        allowedOrigin: "http://localhost:3000",
      });
      expect(result.allowed).toBe(false);
    }
  });
});

describe("deriveAllowedOrigin", () => {
  it("lowercases the scheme and host for a bare `host:port`", () => {
    expect(deriveAllowedOrigin("LocalHost:3000", false)).toBe(
      "http://localhost:3000"
    );
  });

  it("uses https in production", () => {
    expect(deriveAllowedOrigin("example.com", true)).toBe(
      "https://example.com"
    );
  });

  it("passes through an absolute URL", () => {
    expect(deriveAllowedOrigin("https://ShadowBrain.example", true)).toBe(
      "https://shadowbrain.example"
    );
  });
});
