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
    imagePath?: string | null;
  } = {}
) {
  db.prepare(
    `INSERT INTO content_items
       (id, type, title, content, source, is_private, is_hidden, image_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.type ?? "note",
    opts.title === undefined ? `title-${id}` : opts.title,
    `content-${id}`,
    "manual",
    opts.isPrivate ?? 0,
    opts.isHidden ?? 0,
    opts.imagePath ?? null,
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
      image_path: null,
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
      image_path: null,
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

describe("contentLinks.findCoverImagesBySourceIds", () => {
  it("returns the earliest image's path when a source has two linked image targets", () => {
    const db = createTestDb();
    seedItem(db, "source");
    seedItem(db, "img1", { type: "image", imagePath: "/path1.jpg" });
    seedItem(db, "img2", { type: "image", imagePath: "/path2.jpg" });
    seedLink(
      db,
      "l1",
      "source",
      "img1",
      "references",
      "2024-01-01T00:00:00.000Z"
    );
    seedLink(
      db,
      "l2",
      "source",
      "img2",
      "references",
      "2024-02-01T00:00:00.000Z"
    );

    const result = contentLinks.findCoverImagesBySourceIds(db, ["source"]);
    expect(result).toEqual({ source: "/path1.jpg" });
    db.close();
  });

  it("omits a source that only has links to non-image targets", () => {
    const db = createTestDb();
    seedItem(db, "source");
    seedItem(db, "note1", { type: "note" });
    seedLink(db, "l1", "source", "note1");

    const result = contentLinks.findCoverImagesBySourceIds(db, ["source"]);
    expect(result).toEqual({});
    db.close();
  });

  it("returns an empty map for an empty input array", () => {
    const db = createTestDb();
    const result = contentLinks.findCoverImagesBySourceIds(db, []);
    expect(result).toEqual({});
    db.close();
  });

  it("excludes hidden linked images by default, includes them with includeHidden:true", () => {
    const db = createTestDb();
    seedItem(db, "source");
    seedItem(db, "hiddenImg", {
      type: "image",
      imagePath: "/hidden.jpg",
      isHidden: 1,
    });
    seedItem(db, "visibleImg", { type: "image", imagePath: "/visible.jpg" });
    seedLink(db, "l1", "source", "hiddenImg");
    seedLink(db, "l2", "source", "visibleImg");

    expect(contentLinks.findCoverImagesBySourceIds(db, ["source"])).toEqual({
      source: "/visible.jpg",
    });
    expect(
      contentLinks.findCoverImagesBySourceIds(db, ["source"], {
        includeHidden: true,
      })
    ).toEqual({
      source: "/hidden.jpg",
    });
    db.close();
  });

  it("excludes linked images with image_path IS NULL", () => {
    const db = createTestDb();
    seedItem(db, "source");
    seedItem(db, "noPathImg", { type: "image", imagePath: null });
    seedItem(db, "hasPathImg", { type: "image", imagePath: "/has.jpg" });
    seedLink(
      db,
      "l1",
      "source",
      "noPathImg",
      "references",
      "2024-01-01T00:00:00.000Z"
    );
    seedLink(
      db,
      "l2",
      "source",
      "hasPathImg",
      "references",
      "2024-02-01T00:00:00.000Z"
    );

    const result = contentLinks.findCoverImagesBySourceIds(db, ["source"]);
    expect(result).toEqual({ source: "/has.jpg" });
    db.close();
  });

  it("handles multiple source ids in a single query", () => {
    const db = createTestDb();
    seedItem(db, "source1");
    seedItem(db, "source2");
    seedItem(db, "img1", { type: "image", imagePath: "/img1.jpg" });
    seedItem(db, "img2", { type: "image", imagePath: "/img2.jpg" });
    seedLink(db, "l1", "source1", "img1");
    seedLink(db, "l2", "source2", "img2");

    const result = contentLinks.findCoverImagesBySourceIds(db, [
      "source1",
      "source2",
    ]);
    expect(result).toEqual({
      source1: "/img1.jpg",
      source2: "/img2.jpg",
    });
    db.close();
  });

  it("excludes private linked images by default, includes them with includePrivate:true", () => {
    const db = createTestDb();
    seedItem(db, "source");
    seedItem(db, "privateImg", {
      type: "image",
      imagePath: "/private.jpg",
      isPrivate: 1,
    });
    seedItem(db, "visibleImg", { type: "image", imagePath: "/visible.jpg" });
    seedLink(db, "l1", "source", "privateImg");
    seedLink(db, "l2", "source", "visibleImg");

    expect(contentLinks.findCoverImagesBySourceIds(db, ["source"])).toEqual({
      source: "/visible.jpg",
    });
    expect(
      contentLinks.findCoverImagesBySourceIds(db, ["source"], {
        includePrivate: true,
      })
    ).toEqual({
      source: "/private.jpg",
    });
    db.close();
  });
});

describe("contentLinks.createOrIgnore", () => {
  it("inserts a link on the first call and returns changes: 1", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "b");

    const result = contentLinks.createOrIgnore(db, {
      id: "l1",
      source_id: "a",
      target_id: "b",
      link_type: "references",
      created_at: NOW,
    });

    expect(result.changes).toBe(1);

    const links = db.prepare("SELECT * FROM content_links").all();
    expect(links).toHaveLength(1);
    db.close();
  });

  it("is idempotent: second insert with same id is a no-op (changes: 0)", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "b");

    const first = contentLinks.createOrIgnore(db, {
      id: "l1",
      source_id: "a",
      target_id: "b",
      link_type: "references",
      created_at: NOW,
    });

    const second = contentLinks.createOrIgnore(db, {
      id: "l1",
      source_id: "a",
      target_id: "b",
      link_type: "references",
      created_at: NOW,
    });

    expect(first.changes).toBe(1);
    expect(second.changes).toBe(0);

    const links = db.prepare("SELECT * FROM content_links").all();
    expect(links).toHaveLength(1);
    db.close();
  });

  it("does not throw when the id already exists", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "b");

    contentLinks.createOrIgnore(db, {
      id: "l1",
      source_id: "a",
      target_id: "b",
      link_type: "references",
      created_at: NOW,
    });

    expect(() => {
      contentLinks.createOrIgnore(db, {
        id: "l1",
        source_id: "a",
        target_id: "b",
        link_type: "references",
        created_at: NOW,
      });
    }).not.toThrow();

    db.close();
  });
});

describe("contentLinks.findOutboundWithItems image_path enrichment", () => {
  it("carries the target's image_path in the enriched result", () => {
    const db = createTestDb();
    seedItem(db, "a");
    seedItem(db, "b", { type: "image", imagePath: "/img.jpg" });
    seedLink(db, "l1", "a", "b");

    const result = contentLinks.findOutboundWithItems(db, "a");
    expect(result).toHaveLength(1);
    expect(result[0].target.image_path).toBe("/img.jpg");
    db.close();
  });
});
