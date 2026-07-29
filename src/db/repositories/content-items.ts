import Database from "better-sqlite3";
import { contentLinks } from "./content-links";
import { contentTags } from "./content-tags";
import type { LinkedItemRef } from "./content-links";

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

/**
 * A single item in the related-items board response.
 * Enriched with parsed metadata, tags, link type, and optional
 * parent hint for nested items (e.g. task → event).
 */
export interface RelatedItem {
  id: string;
  type: string;
  title: string | null;
  /** Parsed from `metadata.status`, e.g. "todo" | "in_progress" | "done". */
  status: string | null;
  /** Parsed from metadata date fields — each key is present but nullable. */
  dates: {
    start_date: string | null;
    end_date: string | null;
    due_date: string | null;
  };
  tags: string[];
  /** The link type connecting this item to the project (or `happened_during` for nested-only tasks). */
  link_type: string;
  /** For nested tasks, the encapsulating event. `null` for direct related items. */
  parent: { id: string; title: string | null; type: string } | null;
  /** The raw JSON metadata column for merge-safe PATCH payloads. */
  metadata: string | null;
  /** Last-updated timestamp from the underlying `content_items` row. */
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

  /**
   * Load a project and all its related items for the project-board view
   * (issue #196). Returns `null` when the project does not exist or is
   * filtered out by visibility (404). Otherwise returns the project row
   * and a flat list of related items enriched with metadata, tags,
   * link type, and parent hints.
   *
   * Directly-linked items of types `event`, `task`, `bookmark`, `note`,
   * and `person` are included. For each event among the direct items,
   * inbound `happened_during` sources of type `task` are resolved and
   * added as **nested** items with a `parent` hint pointing to the
   * encapsulating event. Tasks that appear both as a direct link to the
   * project and as a nested item under an event are deduplicated in
   * favour of the nested entry (event parent hint wins).
   *
   * Tags are fetched in one batched query (no N+1 per item). Metadata
   * (`status`, `start_date`, `end_date`, `due_date`) is parsed from the
   * stored `metadata` JSON column.
   */
  findRelatedForProject: (
    db: Database.Database,
    projectId: string,
    options: VisibilityOptions = {}
  ): { project: ContentItem; items: RelatedItem[] } | null => {
    // 1. Load project with visibility
    const project = contentItems.findById(db, projectId, options);
    if (!project) return null;

    // 2. Load inbound + outbound enriched links (visibility-filtered)
    const outbound = contentLinks.findOutboundWithItems(db, projectId, options);
    const inbound = contentLinks.findInboundWithItems(db, projectId, options);

    // 3. Collect direct related items — first-encountered link_type wins
    const linkEntries = new Map<
      string,
      { ref: LinkedItemRef; link_type: string }
    >();
    for (const link of inbound) {
      if (!linkEntries.has(link.source.id)) {
        linkEntries.set(link.source.id, {
          ref: link.source,
          link_type: link.link_type,
        });
      }
    }
    for (const link of outbound) {
      if (!linkEntries.has(link.target.id)) {
        linkEntries.set(link.target.id, {
          ref: link.target,
          link_type: link.link_type,
        });
      }
    }

    const RELATED_TYPES = new Set([
      "event",
      "task",
      "bookmark",
      "note",
      "person",
    ]);

    const directItems = Array.from(linkEntries.entries()).filter(([, e]) =>
      RELATED_TYPES.has(e.ref.type)
    );

    // 4. Collect event IDs for nested-task resolution
    const eventIds = directItems
      .filter(([, e]) => e.ref.type === "event")
      .map(([id]) => id);

    // 5. Batch-query nested tasks under those events (no N+1)
    const nestedTaskMap = new Map<
      string,
      { taskTitle: string | null; eventId: string; eventTitle: string | null }
    >();
    if (eventIds.length > 0) {
      const vis = buildVisibilityClauses(options, "ci");
      const placeholders = eventIds.map(() => "?").join(", ");
      const stmt = db.prepare(`
        SELECT
          ci.id AS task_id,
          ci.title AS task_title,
          'happened_during' AS link_type,
          cl.target_id AS event_id
        FROM content_links cl
        JOIN content_items ci ON ci.id = cl.source_id
        WHERE cl.target_id IN (${placeholders})
          AND cl.link_type = 'happened_during'
          AND ci.type = 'task'
          AND ${vis.clauses.join(" AND ")}
        ORDER BY cl.created_at ASC, cl.id ASC
      `);
      const rows = stmt.all(...eventIds, ...vis.params) as Array<{
        task_id: string;
        task_title: string | null;
        event_id: string;
      }>;
      // Build a lookup for event titles from direct items
      const eventTitleMap = new Map<string, string | null>();
      for (const [eid, entry] of directItems) {
        if (entry.ref.type === "event") {
          eventTitleMap.set(eid, entry.ref.title);
        }
      }
      for (const row of rows) {
        // If a task connects to multiple events, keep the first encounter
        if (!nestedTaskMap.has(row.task_id)) {
          nestedTaskMap.set(row.task_id, {
            taskTitle: row.task_title,
            eventId: row.event_id,
            eventTitle: eventTitleMap.get(row.event_id) ?? null,
          });
        }
      }
    }

    // 6. Collect all item IDs for batch fetch
    const allIds = new Set<string>();
    for (const [id] of directItems) allIds.add(id);
    for (const taskId of nestedTaskMap.keys()) allIds.add(taskId);

    // 7. Batch-fetch full rows with same visibility
    const fullRows = new Map<string, ContentItem>();
    if (allIds.size > 0) {
      const vis = buildVisibilityClauses(options);
      const ids = Array.from(allIds);
      const placeholders = ids.map(() => "?").join(", ");
      const stmt = db.prepare(`
        SELECT * FROM content_items
        WHERE id IN (${placeholders})
          AND ${vis.clauses.join(" AND ")}
      `);
      const rows = stmt.all(...ids, ...vis.params) as ContentItem[];
      for (const row of rows) fullRows.set(row.id, row);
    }

    // 8. Batch-fetch tag names
    const allIdsArr = Array.from(allIds);
    const tagsMap = contentTags.findNamesByContentIds(db, allIdsArr);

    // 9. Metadata parser
    function parseMeta(metadata: string | null): {
      status: string | null;
      dates: {
        start_date: string | null;
        end_date: string | null;
        due_date: string | null;
      };
    } {
      const dates = {
        start_date: null as string | null,
        end_date: null as string | null,
        due_date: null as string | null,
      };
      if (!metadata) return { status: null, dates };
      try {
        const parsed = JSON.parse(metadata);
        return {
          status: typeof parsed.status === "string" ? parsed.status : null,
          dates: {
            start_date:
              typeof parsed.start_date === "string" ? parsed.start_date : null,
            end_date:
              typeof parsed.end_date === "string" ? parsed.end_date : null,
            due_date:
              typeof parsed.due_date === "string" ? parsed.due_date : null,
          },
        };
      } catch {
        return { status: null, dates };
      }
    }

    // 10. Assemble items list — deduped with event parent preference
    const items: RelatedItem[] = [];
    const seenIds = new Set<string>();

    function addItem(
      id: string,
      type: string,
      title: string | null,
      linkType: string,
      parent: { id: string; title: string | null; type: string } | null
    ) {
      if (seenIds.has(id)) return;
      seenIds.add(id);
      const row = fullRows.get(id);
      const { status, dates } = row
        ? parseMeta(row.metadata)
        : {
            status: null,
            dates: { start_date: null, end_date: null, due_date: null },
          };
      items.push({
        id,
        type,
        title,
        status,
        dates,
        metadata: row?.metadata ?? null,
        tags: tagsMap[id] ?? [],
        link_type: linkType,
        parent,
        updated_at: row?.updated_at ?? "",
      });
    }

    // Add direct items except tasks (tasks may be replaced by nested entries)
    for (const [id, entry] of directItems) {
      if (entry.ref.type === "task") continue;
      addItem(id, entry.ref.type, entry.ref.title, entry.link_type, null);
    }

    // Add nested tasks (with event parent hint)
    for (const [taskId, nested] of nestedTaskMap) {
      addItem(taskId, "task", nested.taskTitle, "happened_during", {
        id: nested.eventId,
        title: nested.eventTitle,
        type: "event",
      });
    }

    // Add orphan tasks (direct tasks not covered by nested)
    for (const [id, entry] of directItems) {
      if (entry.ref.type === "task" && !seenIds.has(id)) {
        addItem(id, "task", entry.ref.title, entry.link_type, null);
      }
    }

    return { project, items };
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare("DELETE FROM content_items WHERE id = ?");
    return stmt.run(id);
  },
};
