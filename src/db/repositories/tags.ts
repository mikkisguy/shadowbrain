import Database from "better-sqlite3";

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TagWithCount extends Tag {
  count: number;
}

export const tags = {
  create: (
    db: Database.Database,
    tag: { id: string; name: string; color?: string | null; created_at: string }
  ) => {
    const stmt = db.prepare(
      "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)"
    );
    return stmt.run(tag.id, tag.name, tag.color ?? null, tag.created_at);
  },

  findAll: (db: Database.Database) => {
    const stmt = db.prepare("SELECT * FROM tags ORDER BY name");
    return stmt.all() as Tag[];
  },

  findByName: (db: Database.Database, name: string) => {
    const stmt = db.prepare("SELECT * FROM tags WHERE name = ? COLLATE NOCASE");
    return stmt.get(name) as Tag | undefined;
  },

  findById: (db: Database.Database, id: string) => {
    const stmt = db.prepare("SELECT * FROM tags WHERE id = ?");
    return stmt.get(id) as Tag | undefined;
  },

  /**
   * List all tags with a count of how many content items reference each
   * one via `content_tags`. Tags with zero usages are included (LEFT JOIN
   * + COUNT) so the UI can show them as "unused". Ordered by name for a
   * stable, predictable listing.
   */
  listWithCounts: (db: Database.Database) => {
    const stmt = db.prepare(`
      SELECT t.*, COUNT(ct.content_id) as count
      FROM tags t
      LEFT JOIN content_tags ct ON ct.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `);
    return stmt.all() as TagWithCount[];
  },

  /**
   * Rename a tag. The caller is expected to have already validated the
   * new name and ensured it doesn't collide with another tag — the
   * unique constraint on `tags.name` (COLLATE NOCASE) will throw a
   * SqliteError on collision, which the route handler maps to a 409.
   */
  update: (db: Database.Database, id: string, updates: { name: string }) => {
    const stmt = db.prepare("UPDATE tags SET name = ? WHERE id = ?");
    return stmt.run(updates.name, id);
  },

  /**
   * Delete a tag. Rows in `content_tags` referencing this tag are
   * removed automatically by the `ON DELETE CASCADE` foreign key on
   * `content_tags.tag_id`. Returns `changes` so the caller can detect
   * the not-found case (delete of a non-existent id reports 0 changes).
   */
  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare("DELETE FROM tags WHERE id = ?");
    return stmt.run(id);
  },
};
