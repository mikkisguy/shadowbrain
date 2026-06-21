import Database from "better-sqlite3";
import { contentLinks } from "./content-links";
import { contentTags } from "./content-tags";

/**
 * Two-level visibility flags.
 *
 * - `is_hidden = 1` — excluded from default views; the chat AI *may* use
 *   these items in RAG context by default. See issue #54 and the App
 *   Security Baseline spec §2.
 * - `is_private = 1` — excluded from default views; the chat AI may only
 *   use these items when a thread / message has explicitly opted in.
 *   `is_private` is for ShadowBrain-stored content the user does not
 *   want shared externally. True secrets (passwords, bank details) live
 *   in Proton Pass and will be reached via a future `pass-cli`
 *   integration; they are not stored in ShadowBrain.
 *
 * Both columns default to `0` (visible). The read helpers below take
 * `includeHidden` / `includePrivate` options that default to `false`,
 * so a route that forgets to pass them still hides the row.
 */
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
  is_hidden: number;
  created_at: string;
  updated_at: string;
}

/** Options shared by the read helpers below. All flags default to
 *  `false` so a caller that forgets to opt in still hides the row. */
export interface VisibilityOptions {
  /** When false (default), rows with `is_hidden = 1` are excluded from
   *  the result. */
  includeHidden?: boolean;
  /** When false (default), rows with `is_private = 1` are excluded from
   *  the result. */
  includePrivate?: boolean;
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
      is_hidden?: number;
      created_at: string;
      updated_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT INTO content_items (
        id, type, title, content, image_path, source, source_url,
        metadata, is_private, is_hidden, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      item.is_hidden ?? 0,
      item.created_at,
      item.updated_at
    );
  },

  /**
   * Insert a content_item, but silently skip the row if a row with
   * the same `id` already exists. Returns the better-sqlite3
   * `RunResult` so the caller can branch on `changes` to detect
   * "we actually wrote something" vs. "we silently skipped".
   *
   * The migration script and any other bulk-import path that needs
   * to be re-runnable use this method — `create` throws on a
   * PRIMARY KEY collision, which would abort the whole transaction
   * on a re-run.
   */
  createOrIgnore: (
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
      is_hidden?: number;
      created_at: string;
      updated_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO content_items (
        id, type, title, content, image_path, source, source_url,
        metadata, is_private, is_hidden, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      item.is_hidden ?? 0,
      item.created_at,
      item.updated_at
    );
  },

  /**
   * Look up a single content_item by id, honouring the two-level
   * visibility flags. With `includeHidden` / `includePrivate` defaulting
   * to `false`, a row whose `is_hidden` or `is_private` is set is
   * treated as not-found and the function returns `null` — the caller
   * (typically a route handler) surfaces a 404. This is the strictest
   * interpretation: an item with both flags set requires *both*
   * opt-ins to be returned.
   *
   * The return type is `ContentItem | null` (not `| undefined`) so the
   * not-found and the filtered-out cases share a single branch in
   * callers.
   */
  findById: (
    db: Database.Database,
    id: string,
    options: VisibilityOptions = {}
  ): ContentItem | null => {
    const includeHidden = options.includeHidden ?? false;
    const includePrivate = options.includePrivate ?? false;
    const stmt = db.prepare(`
      SELECT * FROM content_items
      WHERE id = ?
        AND (is_hidden = 0 OR ?)
        AND (is_private = 0 OR ?)
    `);
    return (
      (stmt.get(id, includeHidden ? 1 : 0, includePrivate ? 1 : 0) as
        | ContentItem
        | undefined) ?? null
    );
  },

  findAll: (
    db: Database.Database,
    options?: {
      type?: string;
      limit?: number;
      offset?: number;
    } & VisibilityOptions
  ) => {
    const includeHidden = options?.includeHidden ?? false;
    const includePrivate = options?.includePrivate ?? false;
    const where: string[] = ["(is_hidden = 0 OR ?)", "(is_private = 0 OR ?)"];
    const params: (string | number)[] = [
      includeHidden ? 1 : 0,
      includePrivate ? 1 : 0,
    ];

    if (options?.type) {
      where.push("type = ?");
      params.push(options.type);
    }

    let sql = `SELECT * FROM content_items WHERE ${where.join(" AND ")}`;
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
      metadata?: string | null;
      is_private?: number;
      is_hidden?: number;
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
    if (updates.is_hidden !== undefined) {
      fields.push("is_hidden = ?");
      params.push(updates.is_hidden);
    }

    fields.push("updated_at = ?");
    params.push(updates.updated_at);
    params.push(id);

    const stmt = db.prepare(
      `UPDATE content_items SET ${fields.join(", ")} WHERE id = ?`
    );
    return stmt.run(...params);
  },

  /**
   * Paginated list with filters. Visibility flags filter the result set
   * (in addition to the caller's other filters): rows with any set
   * visibility flag without the matching opt-in are excluded. The total
   * count is the *post-filter* count so pagination math stays correct
   * even when hidden / private rows exist.
   */
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
    } & VisibilityOptions
  ) => {
    const includeHidden = options.includeHidden ?? false;
    const includePrivate = options.includePrivate ?? false;

    const where: string[] = [
      "(ci.is_hidden = 0 OR ?)",
      "(ci.is_private = 0 OR ?)",
    ];
    const params: (string | number)[] = [
      includeHidden ? 1 : 0,
      includePrivate ? 1 : 0,
    ];

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

    const whereSql = `WHERE ${where.join(" AND ")}`;

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

  /**
   * Same visibility rules as `findById`: the item is returned only if
   * every set visibility flag is covered by the corresponding opt-in.
   * Otherwise the function returns `null` (treated as 404 by the route).
   */
  findWithRelations: (
    db: Database.Database,
    id: string,
    options: VisibilityOptions = {}
  ) => {
    const item = contentItems.findById(db, id, options);
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
