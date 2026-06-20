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
};
