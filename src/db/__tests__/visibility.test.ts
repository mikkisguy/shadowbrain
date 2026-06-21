import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers";
import { contentItems, search } from "../index";

/**
 * Two-level visibility unit tests (issue #54 / App Security Baseline §2).
 *
 * The read helpers in `src/db/repositories/content-items.ts` and
 * `src/db/search.ts` take `includeHidden` / `includePrivate` options
 * that default to `false`. Rows with `is_hidden = 1` are excluded
 * unless the caller passes `includeHidden: true`; rows with
 * `is_private = 1` are excluded unless the caller passes
 * `includePrivate: true`. The opt-ins are independent: a row with
 * both flags set requires *both* opt-ins to be returned.
 *
 * These tests cover all four `(is_hidden, is_private)` combinations
 * for every read helper, plus a few negative tests (no opt-in → row
 * hidden; partial opt-in → still hidden when the other flag is set).
 */

const NOW = "2024-01-01T00:00:00.000Z";

/** Seed one content_item row with explicit visibility flags. */
function seedItem(
  db: ReturnType<typeof createTestDb>,
  id: string,
  isHidden: 0 | 1,
  isPrivate: 0 | 1
) {
  db.prepare(
    `INSERT INTO content_items
       (id, type, title, content, source, is_private, is_hidden, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    "note",
    `title-${id}`,
    `content-${id}`,
    "manual",
    isPrivate,
    isHidden,
    NOW,
    NOW
  );
}

const VISIBILITY_FIXTURES: Array<{
  id: string;
  isHidden: 0 | 1;
  isPrivate: 0 | 1;
}> = [
  { id: "visible", isHidden: 0, isPrivate: 0 },
  { id: "hidden-only", isHidden: 1, isPrivate: 0 },
  { id: "private-only", isHidden: 0, isPrivate: 1 },
  { id: "both", isHidden: 1, isPrivate: 1 },
];

function seedAllFour(db: ReturnType<typeof createTestDb>) {
  for (const f of VISIBILITY_FIXTURES) {
    seedItem(db, f.id, f.isHidden, f.isPrivate);
  }
}

describe("contentItems.findById visibility", () => {
  it("returns the row when neither flag is set (default opt-in = false)", () => {
    const db = createTestDb();
    seedAllFour(db);
    const result = contentItems.findById(db, "visible");
    expect(result?.id).toBe("visible");
    db.close();
  });

  it("returns null for is_hidden=1 when includeHidden is omitted", () => {
    const db = createTestDb();
    seedAllFour(db);
    expect(contentItems.findById(db, "hidden-only")).toBeNull();
    expect(contentItems.findById(db, "hidden-only", {})).toBeNull();
    expect(
      contentItems.findById(db, "hidden-only", { includeHidden: false })
    ).toBeNull();
    db.close();
  });

  it("returns the row for is_hidden=1 when includeHidden=true", () => {
    const db = createTestDb();
    seedAllFour(db);
    const result = contentItems.findById(db, "hidden-only", {
      includeHidden: true,
    });
    expect(result?.id).toBe("hidden-only");
    db.close();
  });

  it("returns null for is_private=1 when includePrivate is omitted", () => {
    const db = createTestDb();
    seedAllFour(db);
    expect(contentItems.findById(db, "private-only")).toBeNull();
    expect(
      contentItems.findById(db, "private-only", { includePrivate: false })
    ).toBeNull();
    db.close();
  });

  it("returns the row for is_private=1 when includePrivate=true", () => {
    const db = createTestDb();
    seedAllFour(db);
    const result = contentItems.findById(db, "private-only", {
      includePrivate: true,
    });
    expect(result?.id).toBe("private-only");
    db.close();
  });

  it("returns null for both-set row unless both opt-ins are passed", () => {
    const db = createTestDb();
    seedAllFour(db);
    // No opt-ins → null
    expect(contentItems.findById(db, "both")).toBeNull();
    // Only hidden opt-in → still null (private not opted in)
    expect(
      contentItems.findById(db, "both", { includeHidden: true })
    ).toBeNull();
    // Only private opt-in → still null (hidden not opted in)
    expect(
      contentItems.findById(db, "both", { includePrivate: true })
    ).toBeNull();
    // Both opt-ins → returned
    const result = contentItems.findById(db, "both", {
      includeHidden: true,
      includePrivate: true,
    });
    expect(result?.id).toBe("both");
    db.close();
  });

  it("returns null for a non-existent id regardless of opt-ins", () => {
    const db = createTestDb();
    expect(
      contentItems.findById(db, "missing", {
        includeHidden: true,
        includePrivate: true,
      })
    ).toBeNull();
    db.close();
  });
});

describe("contentItems.findWithRelations visibility", () => {
  it("returns null for hidden row without opt-in (mirrors findById)", () => {
    const db = createTestDb();
    seedAllFour(db);
    expect(contentItems.findWithRelations(db, "hidden-only")).toBeNull();
    expect(
      contentItems.findWithRelations(db, "both", {
        includeHidden: true,
        includePrivate: true,
      })
    ).not.toBeNull();
    db.close();
  });

  it("returns the relations payload when opt-ins cover the row", () => {
    const db = createTestDb();
    seedItem(db, "a", 1, 0);
    db.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(
      "t1",
      "tag",
      NOW
    );
    db.prepare(
      `INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)`
    ).run("a", "t1", NOW);
    const result = contentItems.findWithRelations(db, "a", {
      includeHidden: true,
    });
    expect(result?.item.id).toBe("a");
    expect(result?.tags.length).toBe(1);
    db.close();
  });
});

describe("contentItems.listWithFilters visibility", () => {
  it("excludes hidden and private rows by default", () => {
    const db = createTestDb();
    seedAllFour(db);
    const result = contentItems.listWithFilters(db, { limit: 20, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe("visible");
    db.close();
  });

  it("returns hidden rows only when includeHidden=true", () => {
    const db = createTestDb();
    seedAllFour(db);
    const result = contentItems.listWithFilters(db, {
      limit: 20,
      offset: 0,
      includeHidden: true,
    });
    const ids = result.items.map((i) => i.id).sort();
    expect(ids).toEqual(["hidden-only", "visible"]);
    expect(result.total).toBe(2);
    db.close();
  });

  it("returns private rows only when includePrivate=true", () => {
    const db = createTestDb();
    seedAllFour(db);
    const result = contentItems.listWithFilters(db, {
      limit: 20,
      offset: 0,
      includePrivate: true,
    });
    const ids = result.items.map((i) => i.id).sort();
    expect(ids).toEqual(["private-only", "visible"]);
    expect(result.total).toBe(2);
    db.close();
  });

  it("returns both-set row only when both opt-ins are passed", () => {
    const db = createTestDb();
    seedAllFour(db);

    // Only one opt-in still hides the both-set row.
    const onlyHidden = contentItems.listWithFilters(db, {
      limit: 20,
      offset: 0,
      includeHidden: true,
    });
    expect(onlyHidden.items.find((i) => i.id === "both")).toBeUndefined();

    const onlyPrivate = contentItems.listWithFilters(db, {
      limit: 20,
      offset: 0,
      includePrivate: true,
    });
    expect(onlyPrivate.items.find((i) => i.id === "both")).toBeUndefined();

    // Both opt-ins → both-set row returned.
    const both = contentItems.listWithFilters(db, {
      limit: 20,
      offset: 0,
      includeHidden: true,
      includePrivate: true,
    });
    const ids = both.items.map((i) => i.id).sort();
    expect(ids).toEqual(["both", "hidden-only", "private-only", "visible"]);
    expect(both.total).toBe(4);
    db.close();
  });

  it("combines visibility with other filters (type, source)", () => {
    const db = createTestDb();
    seedItem(db, "v1", 0, 0);
    db.prepare(
      `INSERT INTO content_items
         (id, type, title, content, source, is_private, is_hidden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("h1", "bookmark", "h", "y", "discord", 0, 1, NOW, NOW);
    db.prepare(
      `INSERT INTO content_items
         (id, type, title, content, source, is_private, is_hidden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p1", "bookmark", "p", "z", "discord", 1, 0, NOW, NOW);

    // Default: only v1 (visible) is returned.
    const def = contentItems.listWithFilters(db, {
      type: "bookmark",
      limit: 20,
      offset: 0,
    });
    expect(def.items).toEqual([]);

    // Hidden opt-in: h1 is returned.
    const h = contentItems.listWithFilters(db, {
      type: "bookmark",
      limit: 20,
      offset: 0,
      includeHidden: true,
    });
    expect(h.items.map((i) => i.id)).toEqual(["h1"]);

    // Private opt-in: p1 is returned.
    const p = contentItems.listWithFilters(db, {
      type: "bookmark",
      limit: 20,
      offset: 0,
      includePrivate: true,
    });
    expect(p.items.map((i) => i.id)).toEqual(["p1"]);
    db.close();
  });
});

describe("contentItems.findAll visibility", () => {
  it("excludes hidden and private rows by default", () => {
    const db = createTestDb();
    seedAllFour(db);
    const items = contentItems.findAll(db);
    expect(items.map((i) => i.id)).toEqual(["visible"]);
    db.close();
  });

  it("honours includeHidden / includePrivate independently", () => {
    const db = createTestDb();
    seedAllFour(db);
    const hidden = contentItems.findAll(db, { includeHidden: true });
    expect(hidden.map((i) => i.id).sort()).toEqual(["hidden-only", "visible"]);

    const priv = contentItems.findAll(db, { includePrivate: true });
    expect(priv.map((i) => i.id).sort()).toEqual(["private-only", "visible"]);

    const both = contentItems.findAll(db, {
      includeHidden: true,
      includePrivate: true,
    });
    expect(both.map((i) => i.id).sort()).toEqual([
      "both",
      "hidden-only",
      "private-only",
      "visible",
    ]);
    db.close();
  });
});

describe("contentItems.create / update is_hidden column", () => {
  it("persists is_hidden = 1 on create and reads it back", () => {
    const db = createTestDb();
    const id = crypto.randomUUID();
    contentItems.create(db, {
      id,
      type: "note",
      content: "x",
      created_at: NOW,
      updated_at: NOW,
      is_hidden: 1,
    });
    // The row is hidden → default visibility filter returns null.
    expect(contentItems.findById(db, id)).toBeNull();
    // With the opt-in, we get the row back with is_hidden=1.
    const row = contentItems.findById(db, id, { includeHidden: true });
    expect(row?.is_hidden).toBe(1);
    db.close();
  });

  it("update() can flip is_hidden to 0 (un-hide) and the row becomes visible", () => {
    const db = createTestDb();
    const id = crypto.randomUUID();
    contentItems.create(db, {
      id,
      type: "note",
      content: "x",
      created_at: NOW,
      updated_at: NOW,
      is_hidden: 1,
    });
    expect(contentItems.findById(db, id)).toBeNull();

    contentItems.update(db, id, { is_hidden: 0, updated_at: NOW });
    expect(contentItems.findById(db, id)?.id).toBe(id);
    db.close();
  });
});

describe("search.query / queryByType / queryWithFilters / countWithFilters visibility", () => {
  function seedSearchFixtures(db: ReturnType<typeof createTestDb>) {
    // Each row contains a unique keyword so FTS matches predictably.
    seedItem(db, "visible-keyword", 0, 0);
    seedItem(db, "hidden-keyword", 1, 0);
    seedItem(db, "private-keyword", 0, 1);
    seedItem(db, "both-keyword", 1, 1);
  }

  it("query() excludes hidden and private rows by default", () => {
    const db = createTestDb();
    seedSearchFixtures(db);
    const results = search.query(db, "keyword");
    expect(results.map((r) => r.id)).toEqual(["visible-keyword"]);
    db.close();
  });

  it("query() returns hidden rows when includeHidden=true", () => {
    const db = createTestDb();
    seedSearchFixtures(db);
    const results = search.query(db, "keyword", { includeHidden: true });
    expect(results.map((r) => r.id).sort()).toEqual([
      "hidden-keyword",
      "visible-keyword",
    ]);
    db.close();
  });

  it("query() returns private rows when includePrivate=true", () => {
    const db = createTestDb();
    seedSearchFixtures(db);
    const results = search.query(db, "keyword", { includePrivate: true });
    expect(results.map((r) => r.id).sort()).toEqual([
      "private-keyword",
      "visible-keyword",
    ]);
    db.close();
  });

  it("query() returns both-set row only when both opt-ins are passed", () => {
    const db = createTestDb();
    seedSearchFixtures(db);
    expect(
      search.query(db, "keyword", { includeHidden: true }).map((r) => r.id)
    ).not.toContain("both-keyword");
    expect(
      search.query(db, "keyword", { includePrivate: true }).map((r) => r.id)
    ).not.toContain("both-keyword");
    const both = search.query(db, "keyword", {
      includeHidden: true,
      includePrivate: true,
    });
    expect(both.length).toBe(4);
    db.close();
  });

  it("queryByType() applies the same visibility filter", () => {
    const db = createTestDb();
    seedSearchFixtures(db);
    // Add a second type to make the filter meaningful.
    db.prepare(
      `INSERT INTO content_items
         (id, type, title, content, source, is_private, is_hidden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "other-type",
      "bookmark",
      "keyword in bookmark",
      "x",
      "manual",
      0,
      1,
      NOW,
      NOW
    );
    const results = search.queryByType(db, "keyword", "note", {
      includeHidden: true,
    });
    expect(results.map((r) => r.id).sort()).toEqual([
      "hidden-keyword",
      "visible-keyword",
    ]);
    db.close();
  });

  it("queryWithFilters() / countWithFilters() apply the visibility filter", () => {
    const db = createTestDb();
    seedSearchFixtures(db);
    expect(search.queryWithFilters(db, "keyword").map((r) => r.id)).toEqual([
      "visible-keyword",
    ]);
    expect(search.countWithFilters(db, "keyword")).toBe(1);
    expect(
      search.queryWithFilters(db, "keyword", {
        includeHidden: true,
      }).length
    ).toBe(2);
    expect(
      search.countWithFilters(db, "keyword", { includeHidden: true })
    ).toBe(2);
    expect(
      search.queryWithFilters(db, "keyword", {
        includeHidden: true,
        includePrivate: true,
      }).length
    ).toBe(4);
    expect(
      search.countWithFilters(db, "keyword", {
        includeHidden: true,
        includePrivate: true,
      })
    ).toBe(4);
    db.close();
  });
});
