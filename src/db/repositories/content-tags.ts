import Database from "better-sqlite3";
import type { Tag } from "./tags";

export const contentTags = {
  addTag: (
    db: Database.Database,
    contentId: string,
    tagId: string,
    createdAt: string
  ) => {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)"
    );
    return stmt.run(contentId, tagId, createdAt);
  },

  removeTag: (db: Database.Database, contentId: string, tagId: string) => {
    const stmt = db.prepare(
      "DELETE FROM content_tags WHERE content_id = ? AND tag_id = ?"
    );
    return stmt.run(contentId, tagId);
  },

  findByContent: (db: Database.Database, contentId: string) => {
    const stmt = db.prepare(`
      SELECT t.* FROM tags t
      JOIN content_tags ct ON ct.tag_id = t.id
      WHERE ct.content_id = ?
    `);
    return stmt.all(contentId) as Tag[];
  },

  /** Batched tag-name lookup for a set of content ids — a single
   *  query that returns a `Record<contentId, tagName[]>`. Used by
   *  the list / search endpoints to attach each item's tag names
   *  to its row without an N+1 (one query per item). Items with no
   *  tags are absent from the map; callers default them to `[]`.
   *
   *  Names are ordered alphabetically (`tags.name`) so the card's
   *  tag strip is deterministic across requests. */
  /**
   * Move every `content_tags` row from `fromTagId` to `toTagId`.
   * Rows where the target already tags the item are skipped via
   * `UPDATE OR IGNORE` (PK is `(content_id, tag_id)`); any leftover
   * source rows are removed in a follow-up DELETE.
   */
  repointTag: (db: Database.Database, fromTagId: string, toTagId: string) => {
    const update = db.prepare(
      "UPDATE OR IGNORE content_tags SET tag_id = ? WHERE tag_id = ?"
    );
    const remove = db.prepare("DELETE FROM content_tags WHERE tag_id = ?");
    const result = update.run(toTagId, fromTagId);
    remove.run(fromTagId);
    return { changes: result.changes };
  },

  findNamesByContentIds: (
    db: Database.Database,
    contentIds: readonly string[]
  ): Record<string, string[]> => {
    if (contentIds.length === 0) return {};
    const placeholders = contentIds.map(() => "?").join(", ");
    const stmt = db.prepare(`
      SELECT ct.content_id AS contentId, t.name AS name
      FROM content_tags ct
      JOIN tags t ON t.id = ct.tag_id
      WHERE ct.content_id IN (${placeholders})
      ORDER BY t.name
    `);
    const rows = stmt.all(...contentIds) as Array<{
      contentId: string;
      name: string;
    }>;
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      (map[row.contentId] ??= []).push(row.name);
    }
    return map;
  },
};
