import Database from "better-sqlite3";
import { contentLinks } from "./content-links";
import { contentTags } from "./content-tags";

export interface ContentItem {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  metadata: string | null;
  is_private: number;
  created_at: string;
  updated_at: string;
}

export const contentItems = {
  create: (
    db: Database.Database,
    item: {
      id: string;
      type: string;
      title?: string | null;
      content: string;
      image_path?: string | null;
      source?: string;
      source_url?: string | null;
      metadata?: string | null;
      is_private?: number;
      created_at: string;
      updated_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT INTO content_items (
        id, type, title, content, image_path, source, source_url,
        metadata, is_private, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      item.id,
      item.type,
      item.title ?? null,
      item.content,
      item.image_path ?? null,
      item.source ?? "manual",
      item.source_url ?? null,
      item.metadata ?? null,
      item.is_private ?? 0,
      item.created_at,
      item.updated_at
    );
  },

  findById: (db: Database.Database, id: string) => {
    const stmt = db.prepare("SELECT * FROM content_items WHERE id = ?");
    return stmt.get(id) as ContentItem | undefined;
  },

  findAll: (
    db: Database.Database,
    options?: { type?: string; limit?: number; offset?: number }
  ) => {
    let sql = "SELECT * FROM content_items";
    const params: (string | number | null)[] = [];

    if (options?.type) {
      sql += " WHERE type = ?";
      params.push(options.type);
    }

    sql += " ORDER BY created_at DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const stmt = db.prepare(sql);
    return stmt.all(...params) as ContentItem[];
  },

  update: (
    db: Database.Database,
    id: string,
    updates: {
      title?: string | null;
      content?: string;
      metadata?: string;
      is_private?: number;
      updated_at: string;
    }
  ) => {
    const fields: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      params.push(updates.title ?? null);
    }
    if (updates.content !== undefined) {
      fields.push("content = ?");
      params.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      params.push(updates.metadata);
    }
    if (updates.is_private !== undefined) {
      fields.push("is_private = ?");
      params.push(updates.is_private);
    }

    fields.push("updated_at = ?");
    params.push(updates.updated_at);
    params.push(id);

    const stmt = db.prepare(
      `UPDATE content_items SET ${fields.join(", ")} WHERE id = ?`
    );
    return stmt.run(...params);
  },

  listWithFilters: (
    db: Database.Database,
    options: {
      type?: string;
      tag?: string;
      source?: string;
      startDate?: string;
      endDate?: string;
      limit: number;
      offset: number;
    }
  ) => {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (options.type) {
      where.push("ci.type = ?");
      params.push(options.type);
    }
    if (options.source) {
      where.push("ci.source = ?");
      params.push(options.source);
    }
    if (options.startDate) {
      where.push("ci.created_at >= ?");
      params.push(options.startDate);
    }
    if (options.endDate) {
      where.push("ci.created_at <= ?");
      params.push(options.endDate);
    }

    let join = "";
    if (options.tag) {
      join = `
        JOIN content_tags ct ON ct.content_id = ci.id
        JOIN tags t ON t.id = ct.tag_id
      `;
      where.push("t.name = ?");
      params.push(options.tag);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM content_items ci
      ${join}
      ${whereSql}
    `);
    const total = (countStmt.get(...params) as { count: number }).count;

    const itemsStmt = db.prepare(`
      SELECT ci.*
      FROM content_items ci
      ${join}
      ${whereSql}
      ORDER BY ci.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const items = itemsStmt.all(
      ...params,
      options.limit,
      options.offset
    ) as ContentItem[];
    return { items, total };
  },

  findWithRelations: (db: Database.Database, id: string) => {
    const item = contentItems.findById(db, id);
    if (!item) return null;

    const tags = contentTags.findByContent(db, id);
    const outbound = contentLinks.findBySource(db, id);
    const inbound = contentLinks.findByTarget(db, id);

    return { item, tags, links: { outbound, inbound } };
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare("DELETE FROM content_items WHERE id = ?");
    return stmt.run(id);
  },
};
