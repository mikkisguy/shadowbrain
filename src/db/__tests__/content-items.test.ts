import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers";
import { contentItems } from "../index";

describe("contentItems.listWithFilters", () => {
  it("filters by type and source", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "1",
      "note",
      "a",
      "x",
      "web",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "2",
      "bookmark",
      "b",
      "y",
      "discord",
      "2024-01-02T00:00:00.000Z",
      "2024-01-02T00:00:00.000Z"
    );

    const result = contentItems.listWithFilters(db, {
      type: "note",
      source: "web",
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe("1");
    db.close();
  });

  it("filters by tag alone", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "1",
      "note",
      "tagged item",
      "content",
      "web",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "2",
      "note",
      "untagged item",
      "content",
      "web",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(
      "t1",
      "important",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)`
    ).run("1", "t1", "2024-01-01T00:00:00.000Z");

    const result = contentItems.listWithFilters(db, {
      tag: "important",
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe("1");
    db.close();
  });

  it("filters by multiple tags with OR semantics and no duplicates", () => {
    const db = createTestDb();
    const now = "2024-01-01T00:00:00.000Z";
    const insertItem = db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insertItem.run("1", "note", "docker item", "c", "web", now, now);
    insertItem.run("2", "note", "k8s item", "c", "web", now, now);
    insertItem.run("3", "note", "both item", "c", "web", now, now);
    insertItem.run("4", "note", "untagged", "c", "web", now, now);

    const insertTag = db.prepare(
      `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`
    );
    const linkTag = db.prepare(
      `INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)`
    );
    insertTag.run("t1", "docker", now);
    insertTag.run("t2", "kubernetes", now);
    linkTag.run("1", "t1", now); // item 1 → docker
    linkTag.run("2", "t2", now); // item 2 → kubernetes
    linkTag.run("3", "t1", now); // item 3 → docker + kubernetes
    linkTag.run("3", "t2", now);

    const result = contentItems.listWithFilters(db, {
      tag: "docker,kubernetes",
      limit: 20,
      offset: 0,
    });

    // Items 1, 2, 3 match (any-of). Item 3 must not be duplicated
    // despite matching two tags.
    expect(result.total).toBe(3);
    const ids = result.items.map((i) => i.id);
    expect(ids).toContain("1");
    expect(ids).toContain("2");
    expect(ids).toContain("3");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("4");
    db.close();
  });
});

describe("contentItems.findWithRelations", () => {
  it("returns item with tags and links", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "1",
      "note",
      "a",
      "x",
      "web",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "2",
      "note",
      "b",
      "y",
      "web",
      "2024-01-01T00:00:00.000Z",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(
      "t1",
      "tag",
      "2024-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)`
    ).run("1", "t1", "2024-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO content_links (id, source_id, target_id, link_type, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run("l1", "1", "2", "reference", "2024-01-01T00:00:00.000Z");

    const result = contentItems.findWithRelations(db, "1");
    expect(result?.item.id).toBe("1");
    expect(result?.tags.length).toBe(1);
    expect(result?.links.outbound.length).toBe(1);
    expect(result?.links.inbound.length).toBe(0);
    db.close();
  });

  it("returns null for non-existent id", () => {
    const db = createTestDb();
    const result = contentItems.findWithRelations(db, "nonexistent");
    expect(result).toBeNull();
    db.close();
  });
});
