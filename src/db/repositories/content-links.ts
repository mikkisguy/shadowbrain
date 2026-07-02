import Database from "better-sqlite3";
import type { VisibilityOptions } from "./content-items";

export interface ContentLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  context: string | null;
  created_at: string;
}

/** A minimal reference to the content item on the other end of a link —
 *  just what the item-detail sidebar (issue #26) needs to render a row
 *  and link to it. `image_path` is carried so a linked `image`-type
 *  target can serve as a cover image without a second lookup (the item
 *  detail page resolves the first linked image as its fading
 *  background). Null for non-image items. */
export interface LinkedItemRef {
  id: string;
  title: string | null;
  type: string;
  image_path: string | null;
}

/** An outbound link (this item is the `source`) enriched with the
 *  `target` item it points to. */
export interface OutboundLink extends ContentLink {
  target: LinkedItemRef;
}

/** An inbound link / backlink (this item is the `target`) enriched
 *  with the `source` item that points at it. */
export interface InboundLink extends ContentLink {
  source: LinkedItemRef;
}

/** Raw join row shape returned by the enriched link queries before it
 *  is reshaped into {@link OutboundLink} / {@link InboundLink}. */
interface LinkJoinRow {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  context: string | null;
  created_at: string;
  item_id: string;
  item_title: string | null;
  item_type: string;
  item_image_path: string | null;
}

export const contentLinks = {
  create: (
    db: Database.Database,
    link: {
      id: string;
      source_id: string;
      target_id: string;
      link_type?: string;
      context?: string | null;
      created_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT INTO content_links (id, source_id, target_id, link_type, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      link.id,
      link.source_id,
      link.target_id,
      link.link_type ?? "reference",
      link.context ?? null,
      link.created_at
    );
  },

  /**
   * Idempotent insert — silently skip on an `id` collision. Used by
   * the journal-shadows migrator, which generates *stable, deterministic*
   * link ids (a hash of `journalId + rawId`) so a re-run is a no-op
   * rather than throwing on the first PRIMARY KEY collision and
   * rolling the whole transaction. Mirrors
   * `contentItems.createOrIgnore`.
   */
  createOrIgnore: (
    db: Database.Database,
    link: {
      id: string;
      source_id: string;
      target_id: string;
      link_type?: string;
      context?: string | null;
      created_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO content_links (id, source_id, target_id, link_type, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      link.id,
      link.source_id,
      link.target_id,
      link.link_type ?? "reference",
      link.context ?? null,
      link.created_at
    );
  },

  findBySource: (db: Database.Database, sourceId: string) => {
    const stmt = db.prepare("SELECT * FROM content_links WHERE source_id = ?");
    return stmt.all(sourceId) as ContentLink[];
  },

  findByTarget: (db: Database.Database, targetId: string) => {
    const stmt = db.prepare("SELECT * FROM content_links WHERE target_id = ?");
    return stmt.all(targetId) as ContentLink[];
  },

  /**
   * Outbound links from `sourceId`, each enriched with the `target`
   * item it points to (id, title, type) so the caller can render a
   * label and a link without a second round-trip per row.
   *
   * The join is INNER, so a link whose target is filtered out by the
   * two-level visibility flags (issue #54) drops from the result
   * entirely — a caller that did not opt in never learns a hidden /
   * private item is linked. `includeHidden` / `includePrivate` default
   * to `false`, mirroring the content-item read helpers. Rows are
   * ordered newest-first for a stable display order.
   */
  findOutboundWithItems: (
    db: Database.Database,
    sourceId: string,
    options: VisibilityOptions = {}
  ): OutboundLink[] => {
    const includeHidden = options.includeHidden ?? false;
    const includePrivate = options.includePrivate ?? false;
    const stmt = db.prepare(`
      SELECT
        cl.id, cl.source_id, cl.target_id, cl.link_type, cl.context,
        cl.created_at,
        ci.id AS item_id, ci.title AS item_title, ci.type AS item_type,
        ci.image_path AS item_image_path
      FROM content_links cl
      JOIN content_items ci ON ci.id = cl.target_id
      WHERE cl.source_id = ?
        AND (ci.is_hidden = 0 OR ?)
        AND (ci.is_private = 0 OR ?)
      ORDER BY cl.created_at DESC, cl.id
    `);
    const rows = stmt.all(
      sourceId,
      includeHidden ? 1 : 0,
      includePrivate ? 1 : 0
    ) as LinkJoinRow[];
    return rows.map((r) => ({
      id: r.id,
      source_id: r.source_id,
      target_id: r.target_id,
      link_type: r.link_type,
      context: r.context,
      created_at: r.created_at,
      target: {
        id: r.item_id,
        title: r.item_title,
        type: r.item_type,
        image_path: r.item_image_path,
      },
    }));
  },

  /**
   * Inbound links / backlinks to `targetId`, each enriched with the
   * `source` item that points at it. Same INNER-join visibility
   * semantics as {@link findOutboundWithItems}.
   */
  findInboundWithItems: (
    db: Database.Database,
    targetId: string,
    options: VisibilityOptions = {}
  ): InboundLink[] => {
    const includeHidden = options.includeHidden ?? false;
    const includePrivate = options.includePrivate ?? false;
    const stmt = db.prepare(`
      SELECT
        cl.id, cl.source_id, cl.target_id, cl.link_type, cl.context,
        cl.created_at,
        ci.id AS item_id, ci.title AS item_title, ci.type AS item_type,
        ci.image_path AS item_image_path
      FROM content_links cl
      JOIN content_items ci ON ci.id = cl.source_id
      WHERE cl.target_id = ?
        AND (ci.is_hidden = 0 OR ?)
        AND (ci.is_private = 0 OR ?)
      ORDER BY cl.created_at DESC, cl.id
    `);
    const rows = stmt.all(
      targetId,
      includeHidden ? 1 : 0,
      includePrivate ? 1 : 0
    ) as LinkJoinRow[];
    return rows.map((r) => ({
      id: r.id,
      source_id: r.source_id,
      target_id: r.target_id,
      link_type: r.link_type,
      context: r.context,
      created_at: r.created_at,
      source: {
        id: r.item_id,
        title: r.item_title,
        type: r.item_type,
        image_path: r.item_image_path,
      },
    }));
  },

  /**
   * Batched cover-image lookup for a set of content ids. Returns a
   * `Record<sourceId, imagePath>` mapping each id to the
   * `image_path` of its **first linked `image`-type target** — the
   * "main image" used by the browse card background and the item-page
   * fading background.
   *
   * "First" is the earliest-linked image: rows are ordered by
   * `created_at, id` (matching the sidebar ordering) and only the
   * first row per source is kept, so the migrator's convention of
   * stamping each journal→raw link with the raw's `created_at` makes
   * the cover the chronologically first photo of the day.
   *
   * One query for a whole page — mirrors
   * `contentTags.findNamesByContentIds` (no N+1). Items with no
   * linked image are absent from the map; callers fall back to the
   * item's own `image_path` (which is what powers `image`-type
   * cards). Visibility flags default to `false`, mirroring the
   * content-item read helpers, so a hidden / private linked image is
   * only resolved when the caller opts in.
   */
  findCoverImagesBySourceIds: (
    db: Database.Database,
    sourceIds: readonly string[],
    options: VisibilityOptions = {}
  ): Record<string, string> => {
    if (sourceIds.length === 0) return {};
    const includeHidden = options.includeHidden ? 1 : 0;
    const includePrivate = options.includePrivate ? 1 : 0;
    const placeholders = sourceIds.map(() => "?").join(", ");
    const stmt = db.prepare(`
      SELECT cl.source_id AS sourceId, ci.image_path AS imagePath
      FROM content_links cl
      JOIN content_items ci ON ci.id = cl.target_id
      WHERE cl.source_id IN (${placeholders})
        AND ci.type = 'image'
        AND ci.image_path IS NOT NULL
        AND (ci.is_hidden = 0 OR ?)
        AND (ci.is_private = 0 OR ?)
      ORDER BY cl.created_at ASC, cl.id ASC
    `);
    const rows = stmt.all(
      ...sourceIds,
      includeHidden,
      includePrivate
    ) as Array<{ sourceId: string; imagePath: string }>;
    const map: Record<string, string> = {};
    for (const row of rows) {
      // Ordered query — keep only the first (earliest) image per source.
      if (!(row.sourceId in map)) map[row.sourceId] = row.imagePath;
    }
    return map;
  },

  /**
   * True if a link with the given type already exists between `a` and `b`
   * in either direction. Used by the link API to reject duplicates
   * (the schema stores bidirectional links as two rows, so a naive
   * "(source, target, link_type) unique" check would not catch the
   * reverse-direction duplicate that arrives when the same link is
   * requested again).
   */
  existsBetween: (
    db: Database.Database,
    a: string,
    b: string,
    linkType: string
  ) => {
    const stmt = db.prepare(`
      SELECT 1 as hit FROM content_links
      WHERE link_type = ?
        AND ((source_id = ? AND target_id = ?)
          OR (source_id = ? AND target_id = ?))
      LIMIT 1
    `);
    return stmt.get(linkType, a, b, b, a) !== undefined;
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare("DELETE FROM content_links WHERE id = ?");
    return stmt.run(id);
  },
};
