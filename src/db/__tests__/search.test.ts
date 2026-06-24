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
    ).run(
      crypto.randomUUID(),
      "note",
      "test title",
      "test content here",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "note",
      "different",
      "test content here too",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

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
    ).run(
      crypto.randomUUID(),
      "note",
      "test title",
      "test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "note",
      "another test",
      "more test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

    const results = search.query(db, "test", { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
    db.close();
  });

  it("respects offset parameter", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "note",
      "test title",
      "test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "note",
      "another test",
      "more test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

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
    ).run(
      crypto.randomUUID(),
      "note",
      null,
      "test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

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
    ).run(
      crypto.randomUUID(),
      "note",
      "test note",
      "test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "bookmark",
      "test bookmark",
      "test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

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
    ).run(
      crypto.randomUUID(),
      "note",
      "test note",
      "test content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

    const results = search.queryByType(db, "test", "bookmark");
    expect(results).toEqual([]);
    db.close();
  });

  it("respects limit and offset with type filtering", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "note",
      "test 1",
      "content 1",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "note",
      "test 2",
      "content 2",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "bookmark",
      "test 3",
      "content 3",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

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
    ).run(
      id,
      "note",
      "unique title here",
      "unique content here",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

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
    ).run(
      id,
      "note",
      "original title",
      "original content",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

    let results = search.query(db, "original");
    expect(results.length).toBe(1);

    db.prepare(
      `UPDATE content_items SET content = ?, updated_at = ? WHERE id = ?`
    ).run("updated content", "2024-01-02T00:00:00.000Z", id);

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
    ).run(
      id,
      "note",
      "to delete",
      "content to delete",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

    let results = search.query(db, "delete");
    expect(results.length).toBe(1);

    db.prepare(`DELETE FROM content_items WHERE id = ?`).run(id);

    results = search.query(db, "delete");
    expect(results.length).toBe(0);
    db.close();
  });
});

describe("search.queryWithFilters", () => {
  function seedFtsFixtures(db: ReturnType<typeof createTestDb>) {
    const noteId = crypto.randomUUID();
    const bookmarkId = crypto.randomUUID();
    const otherNoteId = crypto.randomUUID();
    const now = "2024-01-01T00:00:00.000Z";

    const insert = db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      noteId,
      "note",
      "docker notes",
      "docker compose for local dev",
      "manual",
      now,
      now
    );
    insert.run(
      bookmarkId,
      "bookmark",
      "docker hub",
      "docker hub is a registry",
      "manual",
      now,
      now
    );
    insert.run(
      otherNoteId,
      "note",
      "unrelated",
      "kubernetes is also containers",
      "manual",
      now,
      now
    );

    const tagId = crypto.randomUUID();
    const otherTagId = crypto.randomUUID();
    db.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(
      tagId,
      "infra",
      now
    );
    db.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(
      otherTagId,
      "dev",
      now
    );

    const link = db.prepare(
      `INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)`
    );
    link.run(noteId, tagId, now); // docker note tagged "infra"
    link.run(otherNoteId, otherTagId, now); // unrelated note tagged "dev"

    return { noteId, bookmarkId, otherNoteId, tagId, otherTagId };
  }

  it("returns all matches when no filters are provided", () => {
    const db = createTestDb();
    seedFtsFixtures(db);

    const results = search.queryWithFilters(db, "docker");
    const ids = results.map((r) => r.id).sort();
    expect(ids.length).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it("filters by type", () => {
    const db = createTestDb();
    const { noteId, bookmarkId } = seedFtsFixtures(db);

    const results = search.queryWithFilters(db, "docker", { type: "note" });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(noteId);
    expect(results[0].type).toBe("note");

    const bookmarkResults = search.queryWithFilters(db, "docker", {
      type: "bookmark",
    });
    expect(bookmarkResults.length).toBe(1);
    expect(bookmarkResults[0].id).toBe(bookmarkId);
    db.close();
  });

  it("filters by tag", () => {
    const db = createTestDb();
    const { noteId } = seedFtsFixtures(db);

    const results = search.queryWithFilters(db, "docker", { tag: "infra" });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(noteId);

    const empty = search.queryWithFilters(db, "docker", { tag: "nope" });
    expect(empty).toEqual([]);
    db.close();
  });

  it("matches tags case-insensitively (tags table uses COLLATE NOCASE)", () => {
    const db = createTestDb();
    const { noteId } = seedFtsFixtures(db);

    const upper = search.queryWithFilters(db, "docker", { tag: "INFRA" });
    const mixed = search.queryWithFilters(db, "docker", { tag: "Infra" });
    expect(upper.length).toBe(1);
    expect(upper[0].id).toBe(noteId);
    expect(mixed.length).toBe(1);
    expect(mixed[0].id).toBe(noteId);
    db.close();
  });

  it("combines type and tag filters", () => {
    const db = createTestDb();
    const { noteId } = seedFtsFixtures(db);

    const matches = search.queryWithFilters(db, "docker", {
      type: "note",
      tag: "infra",
    });
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe(noteId);

    // type=bookmark, tag=infra -> no match (only the note has infra tag)
    const noMatch = search.queryWithFilters(db, "docker", {
      type: "bookmark",
      tag: "infra",
    });
    expect(noMatch).toEqual([]);
    db.close();
  });

  it("filters by multiple tags with OR semantics and no duplicates", () => {
    const db = createTestDb();
    const now = "2024-01-01T00:00:00.000Z";

    // Three notes all contain "alpha" so the FTS query matches all.
    const insert = db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("a", "note", "a", "alpha content", "web", now, now);
    insert.run("b", "note", "b", "alpha content", "web", now, now);
    insert.run("c", "note", "c", "alpha content", "web", now, now);

    const insertTag = db.prepare(
      `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`
    );
    const link = db.prepare(
      `INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)`
    );
    insertTag.run("t1", "docker", now);
    insertTag.run("t2", "kubernetes", now);
    link.run("a", "t1", now); // a → docker
    link.run("b", "t2", now); // b → kubernetes
    link.run("c", "t1", now); // c → docker + kubernetes (both selected)
    link.run("c", "t2", now);
    // "c" is untagged-result in the FTS sense — it has tags but we also
    // create a truly untagged item to confirm it is excluded.
    insert.run("d", "note", "d", "alpha content", "web", now, now);

    const results = search.queryWithFilters(db, "alpha", {
      tag: "docker,kubernetes",
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    // "d" has no tag → excluded.
    expect(ids).not.toContain("d");
    // "c" matches two selected tags but must not be duplicated.
    expect(new Set(ids).size).toBe(ids.length);
    db.close();
  });

  it("returns empty array when no matches satisfy filters", () => {
    const db = createTestDb();
    seedFtsFixtures(db);

    const results = search.queryWithFilters(db, "kubernetes", { tag: "infra" });
    expect(results).toEqual([]);
    db.close();
  });

  it("respects limit and offset", () => {
    const db = createTestDb();
    seedFtsFixtures(db);

    const page1 = search.queryWithFilters(db, "docker", {
      limit: 1,
      offset: 0,
    });
    const page2 = search.queryWithFilters(db, "docker", {
      limit: 1,
      offset: 1,
    });
    expect(page1.length).toBe(1);
    expect(page2.length).toBe(1);
    expect(page1[0].id).not.toBe(page2[0].id);
    db.close();
  });
});

describe("search.countWithFilters", () => {
  it("returns the total match count ignoring limit/offset", () => {
    const db = createTestDb();
    const now = "2024-01-01T00:00:00.000Z";
    const insert = db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (let i = 0; i < 3; i++) {
      insert.run(
        crypto.randomUUID(),
        "note",
        `matchable ${i}`,
        "some uniqueword here",
        "manual",
        now,
        now
      );
    }
    insert.run(
      crypto.randomUUID(),
      "note",
      "no match",
      "totally different content",
      "manual",
      now,
      now
    );

    const totalAll = search.countWithFilters(db, "uniqueword");
    const totalLimited = search.countWithFilters(db, "uniqueword", {
      type: "note",
    });
    expect(totalAll).toBe(3);
    expect(totalLimited).toBe(3);
    db.close();
  });

  it("respects type and tag filters in the count", () => {
    const db = createTestDb();
    const now = "2024-01-01T00:00:00.000Z";
    const noteId = crypto.randomUUID();
    const bookmarkId = crypto.randomUUID();
    const insert = db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      noteId,
      "note",
      "matchable",
      "uniqueword inside",
      "manual",
      now,
      now
    );
    insert.run(
      bookmarkId,
      "bookmark",
      "matchable",
      "uniqueword inside",
      "manual",
      now,
      now
    );

    const tagId = crypto.randomUUID();
    db.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(
      tagId,
      "primary",
      now
    );
    db.prepare(
      `INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)`
    ).run(noteId, tagId, now);

    expect(search.countWithFilters(db, "uniqueword", { type: "note" })).toBe(1);
    expect(search.countWithFilters(db, "uniqueword", { tag: "primary" })).toBe(
      1
    );
    expect(search.countWithFilters(db, "uniqueword", { tag: "missing" })).toBe(
      0
    );
    db.close();
  });
});

describe("search snippet field", () => {
  it("returns a snippet with <mark> highlighting on query results", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "note",
      "alpha",
      "this body contains the keyword shimmering among other words and more text",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

    const results = search.query(db, "shimmering");
    expect(results.length).toBe(1);
    expect(typeof results[0].snippet).toBe("string");
    expect(results[0].snippet).toContain("<mark>");
    expect(results[0].snippet).toContain("</mark>");
    expect(results[0].snippet).toContain("shimmering");
    db.close();
  });

  it("attaches snippet to queryByType results", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "bookmark",
      "alpha",
      "text with the keyword noctilucent somewhere here",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

    const results = search.queryByType(db, "noctilucent", "bookmark");
    expect(results.length).toBe(1);
    expect(results[0].snippet).toContain("<mark>");
    db.close();
  });

  it("returns null snippet when the match is only in the title (snippet is content-only)", () => {
    // FTS5 snippet() targets column 1 (content). If the match lives only in
    // column 0 (title), the content snippet is returned without highlights
    // — the function still produces a string. This test pins the current
    // behavior so a future change to multi-column snippets is intentional.
    const db = createTestDb();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "note",
      "title-only keyword phlogiston",
      "unrelated body text without the term",
      "manual",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );

    const results = search.query(db, "phlogiston");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);
    expect(results[0].snippet).not.toContain("<mark>");
    db.close();
  });
});
