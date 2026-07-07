import Database from "better-sqlite3";
import { contentLinks } from "./content-links";
import { contentTags } from "./content-tags";
import {
  buildVisibilityClauses,
  buildListWhereClause,
} from "./content-item-queries";

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
    const vis = buildVisibilityClauses(options);
    const where = ["id = ?", ...vis.clauses];
    const params = [id, ...vis.params];
    const stmt = db.prepare(
      `SELECT * FROM content_items WHERE ${where.join(" AND ")}`
    );
    return (stmt.get(...params) as ContentItem | undefined) ?? null;
  },

  findAll: (
    db: Database.Database,
    options?: {
      type?: string;
      limit?: number;
      offset?: number;
    } & VisibilityOptions
  ) => {
    const vis = buildVisibilityClauses(options ?? {});
    const where: string[] = [...vis.clauses];
    const params: (string | number)[] = [...vis.params];

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
      type?: string;
      source?: string;
      source_url?: string | null;
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
    if (updates.type !== undefined) {
      fields.push("type = ?");
      params.push(updates.type);
    }
    if (updates.source !== undefined) {
      fields.push("source = ?");
      params.push(updates.source);
    }
    if (updates.source_url !== undefined) {
      fields.push("source_url = ?");
      params.push(updates.source_url ?? null);
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
    const { whereSql, params } = buildListWhereClause(options);

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM content_items ci
      ${whereSql}
    `);
    const total = (countStmt.get(...params) as { count: number }).count;

    const itemsStmt = db.prepare(`
      SELECT ci.*
      FROM content_items ci
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
   *
   * `links.outbound` / `links.inbound` are enriched with the connected
   * item (id, title, type) so the item-detail sidebar (issue #26) can
   * render a label and a link in one pass. The same `options` gate the
   * connected items: a link to a hidden / private item the caller did
   * not opt into is omitted (see `contentLinks.findOutboundWithItems`).
   */
  findWithRelations: (
    db: Database.Database,
    id: string,
    options: VisibilityOptions = {}
  ) => {
    const item = contentItems.findById(db, id, options);
    if (!item) return null;

    const tags = contentTags.findByContent(db, id);
    const outbound = contentLinks.findOutboundWithItems(db, id, options);
    const inbound = contentLinks.findInboundWithItems(db, id, options);

    return { item, tags, links: { outbound, inbound } };
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare("DELETE FROM content_items WHERE id = ?");
    return stmt.run(id);
  },
};
