import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "crypto";
import { requireAuthenticated } from "@/lib/auth/guard";
import { generateToken } from "@/lib/auth/api-token";
import { apiTokens } from "@/db/repositories/api-tokens";
import { createTestDb, cleanupTestDb, authedRequest } from "@/db/test-utils";
import type Database from "better-sqlite3";

// Set up env vars required by the guard and session helpers.
// vi.hoisted runs before module-level code, so all values must be inline.
vi.hoisted(() => {
  process.env.SESSION_SECRET = "a".repeat(32);
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH =
    "$2a$10$0000000000000000000000000000000000000000000000";
  process.env.TRUSTED_PROXY_HEADER = "X-Forwarded-For";
});

describe("requireAuthenticated() with Bearer tokens", () => {
  let db: Database.Database;
  let validToken: string;

  beforeAll(() => {
    cleanupTestDb();
    db = createTestDb();

    // Seed a valid token
    const { raw, prefix, hash } = generateToken();
    validToken = raw;
    apiTokens.create(db, {
      id: crypto.randomUUID(),
      name: "guard-test-token",
      token_prefix: prefix,
      token_hash: hash,
      created_at: new Date().toISOString(),
    });
  });

  afterAll(() => {
    db.close();
    cleanupTestDb();
    vi.unstubAllGlobals();
  });

  it("returns ok:true for valid Bearer token on /api/items", async () => {
    const req = new Request("http://localhost/api/items", {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const result = await requireAuthenticated(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.username).toBe("__api_token__");
    }
  });

  it("returns ok:false with 403 for valid Bearer token on /api/settings", async () => {
    const req = new Request("http://localhost/api/settings", {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const result = await requireAuthenticated(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.error.code).toBe("FORBIDDEN");
    }
  });

  it("returns ok:false with 401 for invalid Bearer token on /api/items", async () => {
    const req = new Request("http://localhost/api/items", {
      headers: { Authorization: "Bearer sb_tok_invalidtoken123" },
    });
    const result = await requireAuthenticated(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns ok:false with 401 when no Bearer header and no session", async () => {
    const req = new Request("http://localhost/api/items");
    const result = await requireAuthenticated(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns ok:true with valid session cookie (no Bearer header)", async () => {
    const req = await authedRequest("http://localhost/api/items");
    const result = await requireAuthenticated(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.username).toBe("admin");
    }
  });
});
