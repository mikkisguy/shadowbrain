import Database from "better-sqlite3";
import { splitTags } from "@/lib/tags";

/**
 * Two-level visibility flags are projected onto the search result so
 * callers can decide whether to surface hidden / private items in the
 * chat RAG context. The read helpers below filter rows out by default
 * (`includeHidden` and `includePrivate` both default to `false`) and
 * rely on the route layer to gate the opt-in behind authentication.
 */
export interface SearchResult {
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
  rank: number;
  /**
   * FTS5-generated snippet from the matching content. Uses
   * `<mark>...</mark>` to wrap matched terms and `…` as the
   * ellipsis. Null when the row has no FTS-indexed text.
   */
  snippet: string | null;
}

/** Visibility opt-in options shared by every search helper. The
 *  flags default to `false` so a caller that forgets to opt in still
 *  hides the row. */
export interface SearchVisibilityOptions {
  includeHidden?: boolean;
  includePrivate?: boolean;
}

export function sanitizeFts5Query(query: string): string {
  // Escape double quotes by doubling them, then wrap each term in quotes
  // to prevent unmatched-quote syntax errors in FTS5.
  // Preserve trailing * for prefix search: hello* -> "hello"*
  // Normalize multiple asterisks to a single prefix operator: test*** -> "test"*
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => {
      const hasPrefix = /\*+$/.test(term);
      const raw = hasPrefix ? term.replace(/\*+$/, "") : term;
      if (!raw) return null;
      const escaped = raw.replace(/"/g, '""');
      const quoted = `"${escaped}"`;
      return hasPrefix ? `${quoted}*` : quoted;
    })
    .filter((term): term is string => term !== null)
    .join(" ");
}

// FTS5 snippet(): column 1 is `content` (column 0 is `title`).
// Snippets are content-only — if a match lives only in the title, the
// returned snippet has no `<mark>` highlights but is still a string.
// Multi-column snippets (e.g. `snippet(..., -1, ...)` or paired title +
// content snippets) are a future enhancement, see #11 follow-up.
// `<mark>...</mark>` wraps matched terms; `…` is the cut-point ellipsis.
// 16 tokens is a comfortable preview size for the search results UI.
const SNIPPET_SQL =
  "snippet(content_items_search, 1, '<mark>', '</mark>', '…', 16)";

/** SQL fragment for the visibility filter. Bound parameters must
 *  follow in the order: hidden-opt-in (0/1), private-opt-in (0/1).
 *  Encapsulating the fragment here keeps the visibility rule in one
 *  place — every read helper agrees on the same predicate. */
const VISIBILITY_WHERE = "(ci.is_hidden = 0 OR ?) AND (ci.is_private = 0 OR ?)";

export const search = {
  query: (
    db: Database.Database,
    query: string,
    options?: { limit?: number; offset?: number } & SearchVisibilityOptions
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const includeHidden = options?.includeHidden ? 1 : 0;
    const includePrivate = options?.includePrivate ? 1 : 0;

    const stmt = db.prepare(`
      SELECT ci.*, bm25(content_items_search) as rank, ${SNIPPET_SQL} as snippet
      FROM content_items ci
      JOIN content_items_search cis ON ci.rowid = cis.rowid
      WHERE content_items_search MATCH ?
        AND ${VISIBILITY_WHERE}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    return stmt.all(
      sanitizeFts5Query(query),
      includeHidden,
      includePrivate,
      limit,
      offset
    ) as SearchResult[];
  },

  queryByType: (
    db: Database.Database,
    query: string,
    type: string,
    options?: { limit?: number; offset?: number } & SearchVisibilityOptions
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const includeHidden = options?.includeHidden ? 1 : 0;
    const includePrivate = options?.includePrivate ? 1 : 0;

    const stmt = db.prepare(`
      SELECT ci.*, bm25(content_items_search) as rank, ${SNIPPET_SQL} as snippet
      FROM content_items ci
      JOIN content_items_search cis ON ci.rowid = cis.rowid
      WHERE content_items_search MATCH ?
        AND ci.type = ?
        AND ${VISIBILITY_WHERE}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    return stmt.all(
      sanitizeFts5Query(query),
      type,
      includeHidden,
      includePrivate,
      limit,
      offset
    ) as SearchResult[];
  },

  queryWithFilters: (
    db: Database.Database,
    query: string,
    options?: {
      type?: string;
      tag?: string;
      limit?: number;
      offset?: number;
    } & SearchVisibilityOptions
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const includeHidden = options?.includeHidden ? 1 : 0;
    const includePrivate = options?.includePrivate ? 1 : 0;

    const where: string[] = ["content_items_search MATCH ?", VISIBILITY_WHERE];
    const params: (string | number)[] = [
      sanitizeFts5Query(query),
      includeHidden,
      includePrivate,
    ];

    const joins = "JOIN content_items_search cis ON ci.rowid = cis.rowid";

    if (options?.type) {
      where.push("ci.type = ?");
      params.push(options.type);
    }
    if (options?.tag) {
      // Multi-tag OR matching via a correlated EXISTS subquery — avoids
      // duplicate rows and keeps COUNT correct. `tags.name` is COLLATE
      // NOCASE so matching is case-insensitive.
      const tagNames = splitTags(options.tag);
      if (tagNames.length > 0) {
        const placeholders = tagNames.map(() => "?").join(",");
        where.push(
          `EXISTS (SELECT 1 FROM content_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.content_id = ci.id AND t.name IN (${placeholders}))`
        );
        params.push(...tagNames);
      }
    }

    params.push(limit, offset);

    const stmt = db.prepare(`
      SELECT ci.*, bm25(content_items_search) as rank, ${SNIPPET_SQL} as snippet
      FROM content_items ci
      ${joins}
      WHERE ${where.join(" AND ")}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    return stmt.all(...params) as SearchResult[];
  },

  countWithFilters: (
    db: Database.Database,
    query: string,
    options?: { type?: string; tag?: string } & SearchVisibilityOptions
  ): number => {
    const includeHidden = options?.includeHidden ? 1 : 0;
    const includePrivate = options?.includePrivate ? 1 : 0;

    const where: string[] = ["content_items_search MATCH ?", VISIBILITY_WHERE];
    const params: (string | number)[] = [
      sanitizeFts5Query(query),
      includeHidden,
      includePrivate,
    ];

    const joins = "JOIN content_items_search cis ON ci.rowid = cis.rowid";

    if (options?.type) {
      where.push("ci.type = ?");
      params.push(options.type);
    }
    if (options?.tag) {
      const tagNames = splitTags(options.tag);
      if (tagNames.length > 0) {
        const placeholders = tagNames.map(() => "?").join(",");
        where.push(
          `EXISTS (SELECT 1 FROM content_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.content_id = ci.id AND t.name IN (${placeholders}))`
        );
        params.push(...tagNames);
      }
    }

    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM content_items ci
      ${joins}
      WHERE ${where.join(" AND ")}
    `);

    return (stmt.get(...params) as { count: number }).count;
  },
};
