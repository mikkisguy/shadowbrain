import { describe, it, expect, vi } from "vitest";
import { createTestDb } from "@/db/__tests__/helpers";
import { retrieveContext } from "../retrieval";
import { search } from "@/db/search";

// ---------------------------------------------------------------------------
// Mock env to control CHAT_RAG_TOP_K without polluting the real env module
// ---------------------------------------------------------------------------
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn().mockReturnValue({ CHAT_RAG_TOP_K: 8 }),
}));

// ---------------------------------------------------------------------------
// Helper: seed a single content item and return its id
// ---------------------------------------------------------------------------
function seedItem(
  db: import("better-sqlite3").Database,
  overrides: Partial<{
    id: string;
    type: string;
    title: string | null;
    content: string;
    source: string;
    is_hidden: number;
    is_private: number;
    created_at: string;
    updated_at: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();
  const stmt = db.prepare(
    `INSERT INTO content_items (id, type, title, content, source, is_hidden, is_private, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    id,
    overrides.type ?? "note",
    overrides.title ?? "test title",
    overrides.content ?? "test content",
    overrides.source ?? "manual",
    overrides.is_hidden ?? 0,
    overrides.is_private ?? 0,
    overrides.created_at ?? "2024-01-01T00:00:00.000Z",
    overrides.updated_at ?? "2024-01-01T00:00:00.000Z"
  );
  return id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("retrieveContext", () => {
  it("returns null for empty message", () => {
    const db = createTestDb();
    expect(retrieveContext(db, "")).toBeNull();
    db.close();
  });

  it("returns null for whitespace-only message", () => {
    const db = createTestDb();
    expect(retrieveContext(db, "   ")).toBeNull();
    db.close();
  });

  it("returns null when no items match", () => {
    const db = createTestDb();
    seedItem(db, {
      title: "Kitty Post",
      content: "kittens are cute and fluffy",
    });
    // Use a term that won't appear in any seeded content
    expect(retrieveContext(db, "nonexistentterm12345")).toBeNull();
    db.close();
  });

  it("returns formatted context block when items match", () => {
    const db = createTestDb();
    seedItem(db, {
      title: "Test Note",
      content: "kittens are cute and fluffy",
      type: "note",
    });

    const result = retrieveContext(db, "kittens");

    expect(result).not.toBeNull();
    // Header
    expect(result).toContain("## Retrieved context");
    expect(result).toContain(
      "The following items were found in the user's knowledge base."
    );
    // Item details
    expect(result).toContain("Test Note");
    expect(result).toContain("(note)");
    // The snippet or content preview should contain "kittens"
    expect(result).toContain("kittens");
    db.close();
  });

  it("includes is_hidden=1 items by default", () => {
    const db = createTestDb();
    seedItem(db, {
      title: "Secret Recipe",
      content: "kittens love tuna",
      is_hidden: 1,
    });

    const result = retrieveContext(db, "kittens");

    expect(result).not.toBeNull();
    expect(result).toContain("Secret Recipe");
    expect(result).toContain("kittens");
    db.close();
  });

  it("excludes is_private=1 items by default", () => {
    const db = createTestDb();
    seedItem(db, {
      title: "Private Diary",
      content: "kittens are secret",
      is_private: 1,
    });

    const result = retrieveContext(db, "kittens");

    expect(result).toBeNull();
    db.close();
  });

  it("includes is_private=1 items when includePrivate=true", () => {
    const db = createTestDb();
    seedItem(db, {
      title: "Private Diary",
      content: "kittens are secret",
      is_private: 1,
    });

    const result = retrieveContext(db, "kittens", { includePrivate: true });

    expect(result).not.toBeNull();
    expect(result).toContain("Private Diary");
    expect(result).toContain("kittens");
    db.close();
  });

  it("respects topK limit", () => {
    const db = createTestDb();
    for (let i = 0; i < 10; i++) {
      seedItem(db, {
        title: `Item ${i}`,
        content: `kittens content number ${i}`,
      });
    }

    const result = retrieveContext(db, "kittens", { topK: 3 });

    expect(result).not.toBeNull();
    // Count formatted item lines (each starts with "- **")
    const itemLines = result!.split("\n").filter((l) => l.startsWith("- **"));
    expect(itemLines).toHaveLength(3);
    db.close();
  });

  it("returns null on error (never throws)", () => {
    const db = createTestDb();
    // Make queryWithFilters throw for this single invocation
    vi.spyOn(search, "queryWithFilters").mockImplementationOnce(() => {
      throw new Error("DB connection lost");
    });

    // Should return null instead of propagating the error
    const result = retrieveContext(db, "kittens");
    expect(result).toBeNull();
    db.close();
  });
});
