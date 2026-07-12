import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { apiTokens } from "@/db/repositories/api-tokens";
import { GET, POST } from "@/app/api/admin/api-tokens/route";
import { DELETE } from "@/app/api/admin/api-tokens/[id]/route";
import { getDb } from "@/db/index";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "a".repeat(32);
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH =
    "$2a$10$0000000000000000000000000000000000000000000000";
});

describe("/api/admin/api-tokens", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  describe("GET", () => {
    it("returns list of tokens without hashes or prefixes", async () => {
      const db = getDb();
      // Seed a test token
      apiTokens.create(db, {
        id: "test-id-1",
        name: "token-one",
        token_prefix: "abc12345",
        token_hash: "does-not-matter",
        created_at: new Date().toISOString(),
      });

      const res = await GET(
        await authedRequest("http://localhost/api/admin/api-tokens")
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe("test-id-1");
      expect(body[0].name).toBe("token-one");
      expect(body[0]).not.toHaveProperty("token_hash");
      expect(body[0]).not.toHaveProperty("token_prefix");
    });

    it("returns empty list when no tokens exist", async () => {
      const res = await GET(
        await authedRequest("http://localhost/api/admin/api-tokens")
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });

  describe("POST", () => {
    it("creates a token and returns raw token once", async () => {
      const res = await POST(
        await authedRequest("http://localhost/api/admin/api-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "my-test-token" }),
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe("my-test-token");
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.token.startsWith("sb_tok_")).toBe(true);
      expect(body.created_at).toBeDefined();

      // Verify it was actually stored in the DB
      const db = getDb();
      const rows = apiTokens.listAll(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("my-test-token");
    });

    it("returns 400 for empty name", async () => {
      const res = await POST(
        await authedRequest("http://localhost/api/admin/api-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing name", async () => {
      const res = await POST(
        await authedRequest("http://localhost/api/admin/api-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE", () => {
    it("revokes an existing token", async () => {
      const db = getDb();
      apiTokens.create(db, {
        id: "revocable-id",
        name: "to-revoke",
        token_prefix: "prefix123",
        token_hash: "hash",
        created_at: new Date().toISOString(),
      });

      const res = await DELETE(
        await authedRequest(
          "http://localhost/api/admin/api-tokens/revocable-id",
          { method: "DELETE" }
        ),
        { params: Promise.resolve({ id: "revocable-id" }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Verify it's revoked in DB
      const rows = apiTokens.listAll(db);
      expect(rows[0].is_revoked).toBe(1);
    });

    it("handles revoking a non-existent token gracefully", async () => {
      const res = await DELETE(
        await authedRequest(
          "http://localhost/api/admin/api-tokens/non-existent-id",
          { method: "DELETE" }
        ),
        { params: Promise.resolve({ id: "non-existent-id" }) }
      );
      // The revoke call is idempotent — no error for missing id
      expect(res.status).toBe(200);
    });
  });
});
