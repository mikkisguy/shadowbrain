import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  generateToken,
  verifyToken,
  isPathInTokenScope,
  TOKEN_SCOPE_PREFIXES,
} from "@/lib/auth/api-token";
import { apiTokens } from "@/db/repositories/api-tokens";
import { createTestDb, cleanupTestDb } from "@/db/test-utils";
import type Database from "better-sqlite3";

describe("generateToken()", () => {
  it("returns raw, prefix, and hash with correct shape", () => {
    const result = generateToken();

    expect(result).toHaveProperty("raw");
    expect(result).toHaveProperty("prefix");
    expect(result).toHaveProperty("hash");
    expect(typeof result.raw).toBe("string");
    expect(typeof result.prefix).toBe("string");
    expect(typeof result.hash).toBe("string");
  });

  it("raw token starts with sb_tok_", () => {
    const { raw } = generateToken();
    expect(raw.startsWith("sb_tok_")).toBe(true);
  });

  it("prefix is 8 hex characters", () => {
    const { prefix } = generateToken();
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
  });

  it("bcrypt.compareSync(raw, hash) returns true", () => {
    const { raw, hash } = generateToken();
    expect(bcrypt.compareSync(raw, hash)).toBe(true);
  });
});

describe("isPathInTokenScope()", () => {
  it("returns true for paths that start with any scope prefix", () => {
    for (const prefix of TOKEN_SCOPE_PREFIXES) {
      expect(isPathInTokenScope(prefix)).toBe(true);
      expect(isPathInTokenScope(prefix + "/123")).toBe(true);
      expect(isPathInTokenScope(prefix + "/sub/path")).toBe(true);
    }
  });

  it("returns false for paths that are a prefix but not a segment", () => {
    expect(isPathInTokenScope("/api/itemsuffix")).toBe(false);
    expect(isPathInTokenScope("/api/tagsextra")).toBe(false);
  });

  it("returns false for paths outside the scope", () => {
    expect(isPathInTokenScope("/api/settings")).toBe(false);
    expect(isPathInTokenScope("/api/admin")).toBe(false);
    expect(isPathInTokenScope("/api/admin/api-tokens")).toBe(false);
    expect(isPathInTokenScope("/api/search")).toBe(false);
    expect(isPathInTokenScope("/api/chat")).toBe(false);
    expect(isPathInTokenScope("/login")).toBe(false);
    expect(isPathInTokenScope("/")).toBe(false);
  });
});

describe("verifyToken()", () => {
  let db: Database.Database;

  beforeAll(() => {
    cleanupTestDb();
    db = createTestDb();
  });

  afterAll(() => {
    db.close();
    cleanupTestDb();
  });

  it("returns the token row for a valid token", async () => {
    const { raw, prefix, hash } = generateToken();
    const id = crypto.randomUUID();

    apiTokens.create(db, {
      id,
      name: "test-token",
      token_prefix: prefix,
      token_hash: hash,
      created_at: new Date().toISOString(),
    });

    const result = await verifyToken(raw, db);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);
    expect(result!.name).toBe("test-token");
  });

  it("returns null for a wrong token", async () => {
    // Create a token in DB, but verify with a different token
    const { prefix, hash } = generateToken();
    const id = crypto.randomUUID();

    apiTokens.create(db, {
      id,
      name: "test-token-2",
      token_prefix: prefix,
      token_hash: hash,
      created_at: new Date().toISOString(),
    });

    const wrongResult = await verifyToken("sb_tok_" + "a".repeat(64), db);
    expect(wrongResult).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const { raw, prefix, hash } = generateToken();
    const id = crypto.randomUUID();

    apiTokens.create(db, {
      id,
      name: "revocable-token",
      token_prefix: prefix,
      token_hash: hash,
      created_at: new Date().toISOString(),
    });

    // Revoke the token
    apiTokens.revoke(db, id);

    const result = await verifyToken(raw, db);
    expect(result).toBeNull();
  });
});
