import { describe, it, expect } from "vitest";

import {
  isBrowserNavigation,
  isExemptFromAuth,
  isLoginPath,
  isStaticAsset,
  normalizePathname,
} from "../exempt-paths";

describe("normalizePathname", () => {
  it("strips the query string", () => {
    expect(normalizePathname("/login?from=%2F")).toBe("/login");
  });

  it("strips trailing slashes (but keeps root)", () => {
    expect(normalizePathname("/login/")).toBe("/login");
    expect(normalizePathname("/")).toBe("/");
  });

  it("collapses repeated slashes", () => {
    expect(normalizePathname("//foo//bar")).toBe("/foo/bar");
  });
});

describe("isExemptFromAuth", () => {
  it("matches the login page exactly", () => {
    expect(isExemptFromAuth("/login")).toBe(true);
  });

  it("does not match a hypothetical /api/admin/login (suffix-only would match)", () => {
    expect(isExemptFromAuth("/api/admin/login")).toBe(false);
  });

  it("matches the public auth API paths exactly", () => {
    expect(isExemptFromAuth("/api/auth/login")).toBe(true);
    expect(isExemptFromAuth("/api/auth/logout")).toBe(true);
  });

  it("does not match /api/items even with a trailing slash", () => {
    expect(isExemptFromAuth("/api/items/")).toBe(false);
    expect(isExemptFromAuth("/api/items")).toBe(false);
  });
});

describe("isLoginPath", () => {
  it("is true only for the exact login path", () => {
    expect(isLoginPath("/login")).toBe(true);
    expect(isLoginPath("/login/")).toBe(true);
    expect(isLoginPath("/api/auth/login")).toBe(false);
  });
});

describe("isStaticAsset", () => {
  it("matches Next.js internals", () => {
    expect(isStaticAsset("/_next/static/foo.css")).toBe(true);
    expect(isStaticAsset("/_next/image?url=foo")).toBe(true);
  });

  it("matches the favicon", () => {
    expect(isStaticAsset("/favicon.ico")).toBe(true);
  });

  it("does not match user content", () => {
    expect(isStaticAsset("/api/items")).toBe(false);
    expect(isStaticAsset("/login")).toBe(false);
  });
});

describe("isBrowserNavigation", () => {
  it("is true when Accept includes text/html", () => {
    const req = new Request("http://localhost/", {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    expect(isBrowserNavigation(req)).toBe(true);
  });

  it("is true when Sec-Fetch-Dest is document", () => {
    const req = new Request("http://localhost/", {
      headers: { "Sec-Fetch-Dest": "document" },
    });
    expect(isBrowserNavigation(req)).toBe(true);
  });

  it("is false for a JSON fetch", () => {
    const req = new Request("http://localhost/", {
      headers: { Accept: "application/json" },
    });
    expect(isBrowserNavigation(req)).toBe(false);
  });
});
