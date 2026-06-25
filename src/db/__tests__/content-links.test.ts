import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers";
import { contentLinks } from "../index";

/**
 * Enriched link reads for the item-detail sidebar (issue #26).
 *
 * `findOutboundWithItems` / `findInboundWithItems` join `content_links`
 * to the connected `content_items` row so each result carries the
 * item's id, title, and type. The join is INNER and visibility-aware:
 * a link whose connected item is hidden / private drops unless the
 * matching opt-in is passed.
 */

const NOW = "2024-01-01T00:00:00.000Z";

function seedItem(
  db: ReturnType<typeof createTestDb>,
  id: string,
  opts: {
    title?: string | null;
    type?: string;
    isHidden?: 0 | 1;
    isPrivate?: 0 | 1;
  } = {}
) {
  db.prepare(
    `INSERT INTO content_items
       (id, type, title, content, source, is_private, is_hidden, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.type ?? "note",
    opts.title === undefined ? `title-${id}` : opts.title,
    `content-${id}`,
    "manual",
    opts.isPrivate ?? 0,
    opts.isHidden ?? 0,
    NOW,
    NOW
  );
}

function seedLink(
  db: ReturnType<typeof createTestDb>,
  id: string,
  sourceId: string,
  targetId: string,
  linkType = "references",
  createdAt = NOW
) {
  db.prepare(
    `INSERT INTO content_links (id, source_id, target_id, link_type, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, sourceId, targetId, linkType, createdAt);
}

describe("contentLinks.findOutboundWithItems", () => {
  it("returns outbound links enriched with the target item", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "b", { title: "Target", type: "project" });
    seedLink(db, "l1", "a", "b", "depends-on");

    const result = contentLinks.findOutboundWithItems(db, "a");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l1");
    expect(result[0].link_type).toBe("depends-on");
    expect(result[0].target).toEqual({
      id: "b",
      title: "Target",
      type: "project",
    });
    db.close();
  });

  it("omits links to hidden targets unless includeHidden is passed", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "hidden", { isHidden: 1 });
    seedLink(db, "l1", "a", "hidden");

    expect(contentLinks.findOutboundWithItems(db, "a")).toHaveLength(0);
    expect(
      contentLinks.findOutboundWithItems(db, "a", { includeHidden: true })
    ).toHaveLength(1);
    db.close();
  });

  it("omits links to private targets unless includePrivate is passed", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "private", { isPrivate: 1 });
    seedLink(db, "l1", "a", "private");

    expect(contentLinks.findOutboundWithItems(db, "a")).toHaveLength(0);
    expect(
      contentLinks.findOutboundWithItems(db, "a", { includePrivate: true })
    ).toHaveLength(1);
    db.close();
  });

  it("requires both opt-ins for a target with both flags set", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "both", { isHidden: 1, isPrivate: 1 });
    seedLink(db, "l1", "a", "both");

    expect(contentLinks.findOutboundWithItems(db, "a")).toHaveLength(0);
    expect(
      contentLinks.findOutboundWithItems(db, "a", { includeHidden: true })
    ).toHaveLength(0);
    expect(
      contentLinks.findOutboundWithItems(db, "a", { includePrivate: true })
    ).toHaveLength(0);
    expect(
      contentLinks.findOutboundWithItems(db, "a", {
        includeHidden: true,
        includePrivate: true,
      })
    ).toHaveLength(1);
    db.close();
  });

  it("orders results newest-first", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "old");
    seedItem(db, "new");
    seedLink(db, "l-old", "a", "old", "references", "2024-01-01T00:00:00.000Z");
    seedLink(db, "l-new", "a", "new", "references", "2024-02-01T00:00:00.000Z");

    const result = contentLinks.findOutboundWithItems(db, "a");
    expect(result.map((r) => r.target.id)).toEqual(["new", "old"]);
    db.close();
  });
});

describe("contentLinks.findInboundWithItems", () => {
  it("returns inbound links enriched with the source item", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "b", { title: "Referrer", type: "note" });
    seedLink(db, "l1", "b", "a", "references");

    const result = contentLinks.findInboundWithItems(db, "a");
    expect(result).toHaveLength(1);
    expect(result[0].source).toEqual({
      id: "b",
      title: "Referrer",
      type: "note",
    });
    db.close();
  });

  it("omits backlinks from hidden/private sources without the opt-in", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "h", { isHidden: 1 });
    seedItem(db, "p", { isPrivate: 1 });
    seedLink(db, "l1", "h", "a");
    seedLink(db, "l2", "p", "a");

    expect(contentLinks.findInboundWithItems(db, "a")).toHaveLength(0);
    expect(
      contentLinks.findInboundWithItems(db, "a", {
        includeHidden: true,
        includePrivate: true,
      })
    ).toHaveLength(2);
    db.close();
  });

  it("preserves a null title on the connected item", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "b", { title: null });
    seedLink(db, "l1", "b", "a");

    const result = contentLinks.findInboundWithItems(db, "a");
    expect(result[0].source.title).toBeNull();
    db.close();
  });
});
