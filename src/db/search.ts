import Database from "better-sqlite3";

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

export const search = {
  query: (
    db: Database.Database,
    query: string,
    options?: { limit?: number; offset?: number }
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const stmt = db.prepare(`
      SELECT ci.*, bm25(content_items_search) as rank, ${SNIPPET_SQL} as snippet
      FROM content_items ci
      JOIN content_items_search cis ON ci.rowid = cis.rowid
      WHERE content_items_search MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    return stmt.all(sanitizeFts5Query(query), limit, offset) as SearchResult[];
  },

  queryByType: (
    db: Database.Database,
    query: string,
    type: string,
    options?: { limit?: number; offset?: number }
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const stmt = db.prepare(`
      SELECT ci.*, bm25(content_items_search) as rank, ${SNIPPET_SQL} as snippet
      FROM content_items ci
      JOIN content_items_search cis ON ci.rowid = cis.rowid
      WHERE content_items_search MATCH ? AND ci.type = ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    return stmt.all(
      sanitizeFts5Query(query),
      type,
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
    }
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: string[] = ["content_items_search MATCH ?"];
    const params: (string | number)[] = [sanitizeFts5Query(query)];

    let joins = "JOIN content_items_search cis ON ci.rowid = cis.rowid";

    if (options?.type) {
      where.push("ci.type = ?");
      params.push(options.type);
    }
    if (options?.tag) {
      // tags.name uses COLLATE NOCASE; the comparison inherits the column
      // collation, so tag matching is case-insensitive without extra work.
      joins += `
        JOIN content_tags ct ON ct.content_id = ci.id
        JOIN tags t ON t.id = ct.tag_id
      `;
      where.push("t.name = ?");
      params.push(options.tag);
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
    options?: { type?: string; tag?: string }
  ): number => {
    const where: string[] = ["content_items_search MATCH ?"];
    const params: (string | number)[] = [sanitizeFts5Query(query)];

    let joins = "JOIN content_items_search cis ON ci.rowid = cis.rowid";

    if (options?.type) {
      where.push("ci.type = ?");
      params.push(options.type);
    }
    if (options?.tag) {
      joins += `
        JOIN content_tags ct ON ct.content_id = ci.id
        JOIN tags t ON t.id = ct.tag_id
      `;
      where.push("t.name = ?");
      params.push(options.tag);
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
