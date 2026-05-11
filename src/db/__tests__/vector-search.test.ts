import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import {
  vectorSearch,
  upsertEmbedding,
  getEmbedding,
  deleteEmbedding,
  isVecExtensionLoaded,
  getVectorCount,
} from "../index";
import { runMigrations } from "../migrations";

function createFreshTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Load sqlite-vec extension if available
  const extensionPath = process.env.SQLITE_VEC_EXTENSION_PATH || "/mnt/md/extra/projects/shadowbrain/dist/extensions/vec0.so";
  try {
    db.loadExtension(extensionPath);
    console.log("✓ Loaded sqlite-vec extension for tests");
  } catch (err) {
    console.warn("Failed to load sqlite-vec extension for tests:", err);
  }

  runMigrations(db);
  return db;
}

describe("isVecExtensionLoaded", () => {
  it("returns true when vec0 extension is loaded", () => {
    const db = createFreshTestDb();
    const isLoaded = isVecExtensionLoaded(db);
    expect(isLoaded).toBe(true);
    db.close();
  });
});

describe("upsertEmbedding", () => {
  it("inserts a new embedding for a content item", () => {
    const db = createFreshTestDb();
    const contentId = crypto.randomUUID();
    const embedding = Array(384).fill(0.1).map((_, i) => i * 0.001);

    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(contentId, "note", "test note", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    upsertEmbedding(db, contentId, embedding);

    const retrieved = getEmbedding(db, contentId);
    expect(retrieved).not.toBeNull();
    expect(retrieved).toHaveLength(384);
    // Check approximate equality due to float32 precision
    retrieved!.forEach((val, i) => {
      expect(val).toBeCloseTo(embedding[i], 5);
    });
    db.close();
  });

  it("updates an existing embedding", () => {
    const db = createFreshTestDb();
    const contentId = crypto.randomUUID();
    const embedding1 = Array(384).fill(0);
    const embedding2 = Array(384).fill(1);

    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(contentId, "note", "test note", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    upsertEmbedding(db, contentId, embedding1);
    upsertEmbedding(db, contentId, embedding2);

    const retrieved = getEmbedding(db, contentId);
    expect(retrieved).not.toBeNull();
    expect(retrieved).toHaveLength(384);
    // Check approximate equality due to float32 precision
    retrieved!.forEach((val, i) => {
      expect(val).toBeCloseTo(embedding2[i], 5);
    });
    db.close();
  });

  it("does not insert when content item does not exist", () => {
    const db = createFreshTestDb();
    const contentId = crypto.randomUUID();
    const embedding = Array(384).fill(0);

    // This should not throw an error, but should not insert anything
    upsertEmbedding(db, contentId, embedding);

    // Verify that no embedding was created
    const result = getEmbedding(db, contentId);
    expect(result).toBeNull();
    db.close();
  });
});

describe("getEmbedding", () => {
  it("returns null for non-existent content item", () => {
    const db = createFreshTestDb();
    const embedding = getEmbedding(db, crypto.randomUUID());
    expect(embedding).toBeNull();
    db.close();
  });

  it("returns null for content item without embedding", () => {
    const db = createFreshTestDb();
    const contentId = crypto.randomUUID();

    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(contentId, "note", "test note", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const embedding = getEmbedding(db, contentId);
    expect(embedding).toBeNull();
    db.close();
  });

  it("returns the stored embedding", () => {
    const db = createFreshTestDb();
    const contentId = crypto.randomUUID();
    const embedding = Array(384).fill(0.5).map((_, i) => i * 0.001);

    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(contentId, "note", "test note", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    upsertEmbedding(db, contentId, embedding);
    const retrieved = getEmbedding(db, contentId);

    expect(retrieved).not.toBeNull();
    expect(retrieved).toHaveLength(384);
    // Check approximate equality due to float32 precision
    retrieved!.forEach((val, i) => {
      expect(val).toBeCloseTo(embedding[i], 5);
    });
    db.close();
  });
});

describe("deleteEmbedding", () => {
  it("deletes an existing embedding", () => {
    const db = createFreshTestDb();
    const contentId = crypto.randomUUID();
    const embedding = Array(384).fill(0);

    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(contentId, "note", "test note", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    upsertEmbedding(db, contentId, embedding);
    expect(getEmbedding(db, contentId)).not.toBeNull();

    deleteEmbedding(db, contentId);
    expect(getEmbedding(db, contentId)).toBeNull();
    db.close();
  });

  it("does not throw when deleting non-existent embedding", () => {
    const db = createFreshTestDb();
    expect(() => {
      deleteEmbedding(db, crypto.randomUUID());
    }).not.toThrow();
    db.close();
  });
});

describe("getVectorCount", () => {
  it("returns 0 for empty database", () => {
    const db = createFreshTestDb();
    const count = getVectorCount(db);
    expect(count).toBe(0);
    db.close();
  });

  it("returns correct count after inserting embeddings", () => {
    const db = createFreshTestDb();

    for (let i = 0; i < 3; i++) {
      const contentId = crypto.randomUUID();
      const embedding = Array(384).fill(i * 0.1);
      db.prepare(
        `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(contentId, "note", `note ${i}`, `content ${i}`, "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
      upsertEmbedding(db, contentId, embedding);
    }

    const count = getVectorCount(db);
    expect(count).toBe(3);
    db.close();
  });
});

describe("vectorSearch", () => {
  it("returns empty array when no embeddings exist", () => {
    const db = createFreshTestDb();
    const queryEmbedding = Array(384).fill(0);
    const results = vectorSearch(db, queryEmbedding);
    expect(results).toEqual([]);
    db.close();
  });

  it("returns results ordered by distance", () => {
    const db = createFreshTestDb();

    // Insert content items with embeddings
    const embeddings = [
      { id: crypto.randomUUID(), embedding: Array(384).fill(0) },
      { id: crypto.randomUUID(), embedding: Array(384).fill(0.1) },
      { id: crypto.randomUUID(), embedding: Array(384).fill(0.5) },
    ];

    for (const { id, embedding } of embeddings) {
      db.prepare(
        `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, "note", `note ${id.substring(0, 4)}`, "content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
      upsertEmbedding(db, id, embedding);
    }

    const queryEmbedding = Array(384).fill(0);
    const results = vectorSearch(db, queryEmbedding);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].distance).toBeLessThanOrEqual(results[results.length - 1].distance);
    db.close();
  });

  it("respects limit parameter", () => {
    const db = createFreshTestDb();

    for (let i = 0; i < 5; i++) {
      const contentId = crypto.randomUUID();
      const embedding = Array(384).fill(i * 0.1);
      db.prepare(
        `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(contentId, "note", `note ${i}`, "content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
      upsertEmbedding(db, contentId, embedding);
    }

    const queryEmbedding = Array(384).fill(0);
    const results = vectorSearch(db, queryEmbedding, { limit: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
    db.close();
  });

  it("filters by type when specified", () => {
    const db = createFreshTestDb();

    const noteId = crypto.randomUUID();
    const bookmarkId = crypto.randomUUID();

    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(noteId, "note", "test note", "content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    upsertEmbedding(db, noteId, Array(384).fill(0));

    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(bookmarkId, "bookmark", "test bookmark", "content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    upsertEmbedding(db, bookmarkId, Array(384).fill(0.5));

    const queryEmbedding = Array(384).fill(0);
    const results = vectorSearch(db, queryEmbedding, { type: "note" });

    expect(results.length).toBe(1);
    expect(results[0].type).toBe("note");
    db.close();
  });
});
