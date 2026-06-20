import Database from "better-sqlite3";

export interface ContentLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  context: string | null;
  created_at: string;
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

  findBySource: (db: Database.Database, sourceId: string) => {
    const stmt = db.prepare("SELECT * FROM content_links WHERE source_id = ?");
    return stmt.all(sourceId) as ContentLink[];
  },

  findByTarget: (db: Database.Database, targetId: string) => {
    const stmt = db.prepare("SELECT * FROM content_links WHERE target_id = ?");
    return stmt.all(targetId) as ContentLink[];
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
