import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb, seedTestDb } from "../test-utils";
import { contentItems } from "../index";

describe("contentItems.listWithFilters", () => {
  beforeEach(() => cleanupTestDb());
  afterEach(() => cleanupTestDb());

  it("filters by type and source", () => {
    const db = createTestDb();
    seedTestDb(db, {
      contentItems: [
        {
          id: "1",
          type: "note",
          title: "a",
          content: "x",
          source: "web",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          type: "bookmark",
          title: "b",
          content: "y",
          source: "discord",
          created_at: "2024-01-02T00:00:00.000Z",
          updated_at: "2024-01-02T00:00:00.000Z",
        },
      ],
    });

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
});

describe("contentItems.findWithRelations", () => {
  beforeEach(() => cleanupTestDb());
  afterEach(() => cleanupTestDb());

  it("returns item with tags and links", () => {
    const db = createTestDb();
    seedTestDb(db, {
      contentItems: [
        {
          id: "1",
          type: "note",
          title: "a",
          content: "x",
          source: "web",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          type: "note",
          title: "b",
          content: "y",
          source: "web",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      tags: [{ id: "t1", name: "tag", created_at: "2024-01-01T00:00:00.000Z" }],
      contentTags: [{ content_id: "1", tag_id: "t1", created_at: "2024-01-01T00:00:00.000Z" }],
      links: [
        { id: "l1", source_id: "1", target_id: "2", link_type: "reference", created_at: "2024-01-01T00:00:00.000Z" },
      ],
    });

    const result = contentItems.findWithRelations(db, "1");
    expect(result?.item.id).toBe("1");
    expect(result?.tags.length).toBe(1);
    expect(result?.links.outbound.length).toBe(1);
    expect(result?.links.inbound.length).toBe(0);
    db.close();
  });
});
