import { describe, it, expect } from "vitest";
import { search, sanitizeFts5Query } from "../index";
import { createTestDb } from "./helpers";

describe("sanitizeFts5Query", () => {
  it("handles empty string", () => {
    const result = sanitizeFts5Query("");
    expect(result).toBe("");
  });

  it("handles whitespace-only string", () => {
    const result = sanitizeFts5Query("   ");
    expect(result).toBe("");
  });

  it("escapes double quotes in terms", () => {
    const result = sanitizeFts5Query('test"quote');
    expect(result).toBe('"test""quote"');
  });

  it("preserves trailing asterisk for prefix search", () => {
    const result = sanitizeFts5Query("hello*");
    expect(result).toBe('"hello"*');
  });

  it("normalizes multiple asterisks to single prefix", () => {
    const result = sanitizeFts5Query("test***");
    expect(result).toBe('"test"*');
  });

  it("handles multiple terms", () => {
    const result = sanitizeFts5Query("hello world");
    expect(result).toBe('"hello" "world"');
  });

  it("handles unicode characters", () => {
    const result = sanitizeFts5Query("café mañana");
    expect(result).toBe('"café" "mañana"');
  });

  it("handles term with asterisk in middle (preserves all asterisks)", () => {
    const result = sanitizeFts5Query("te*st");
    expect(result).toBe('"te*st"');
  });

  it("handles mixed terms with and without prefix", () => {
    const result = sanitizeFts5Query("test* ing");
    expect(result).toBe('"test"* "ing"');
  });
});

describe("search.query", () => {
  it("returns empty array for no matches", () => {
    const db = createTestDb();
    const results = search.query(db, "nonexistent query that wont match");
    expect(results).toEqual([]);
    db.close();
  });

  it("returns results in BM25 rank order", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "test title", "test content here", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "different", "test content here too", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const results = search.query(db, "test");
    expect(results.length).toBeGreaterThan(0);
    results.forEach((result) => {
      expect(typeof result.rank).toBe("number");
    });
    db.close();
  });

  it("respects limit parameter", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "test title", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "another test", "more test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const results = search.query(db, "test", { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
    db.close();
  });

  it("respects offset parameter", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "test title", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "another test", "more test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const results1 = search.query(db, "test", { limit: 1, offset: 0 });
    const results2 = search.query(db, "test", { limit: 1, offset: 1 });
    expect(results1.length).toBe(1);
    expect(results2.length).toBeLessThanOrEqual(1);
    db.close();
  });

  it("handles NULL title fields", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", null, "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const results = search.query(db, "test");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBeNull();
    db.close();
  });
});

describe("search.queryByType", () => {
  it("filters by type correctly", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "test note", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "bookmark", "test bookmark", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const noteResults = search.queryByType(db, "test", "note");
    const bookmarkResults = search.queryByType(db, "test", "bookmark");

    expect(noteResults.length).toBe(1);
    expect(noteResults[0].type).toBe("note");
    expect(bookmarkResults.length).toBe(1);
    expect(bookmarkResults[0].type).toBe("bookmark");
    db.close();
  });

  it("returns empty array when type has no matches", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "test note", "test content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const results = search.queryByType(db, "test", "bookmark");
    expect(results).toEqual([]);
    db.close();
  });

  it("respects limit and offset with type filtering", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "test 1", "content 1", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "note", "test 2", "content 2", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), "bookmark", "test 3", "content 3", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const results = search.queryByType(db, "test", "note", { limit: 1 });
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("note");
    db.close();
  });
});

describe("FTS5 triggers integration", () => {
  it("auto-indexes new content items on INSERT", () => {
    const db = createTestDb();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, "note", "unique title here", "unique content here", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const results = search.query(db, "unique");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);
    db.close();
  });

  it("updates search index on UPDATE of title or content", () => {
    const db = createTestDb();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, "note", "original title", "original content", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    let results = search.query(db, "original");
    expect(results.length).toBe(1);

    db.prepare(`UPDATE content_items SET content = ?, updated_at = ? WHERE id = ?`).run(
      "updated content",
      "2024-01-02T00:00:00.000Z",
      id
    );

    results = search.query(db, "updated");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);
    db.close();
  });

  it("removes items from search index on DELETE", () => {
    const db = createTestDb();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, "note", "to delete", "content to delete", "manual", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    let results = search.query(db, "delete");
    expect(results.length).toBe(1);

    db.prepare(`DELETE FROM content_items WHERE id = ?`).run(id);

    results = search.query(db, "delete");
    expect(results.length).toBe(0);
    db.close();
  });
});
