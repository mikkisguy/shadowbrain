/**
 * FTS5 search-snippet parsing.
 *
 * Shared by the browse feed (`src/app/browse/content-card.tsx`) and
 * the command palette (`src/components/command-palette/snippet.tsx`).
 * Both render the `snippet` field returned by `GET /api/search`,
 * where SQLite FTS5 wraps matched terms in `<mark>…</mark>`.
 *
 * XSS note — this is the load-bearing safety property:
 *   The `content_items.content` column is arbitrary user text, and
 *   SQLite's FTS5 `snippet()` does **not** HTML-escape its input. We
 *   therefore never interpolate raw snippet HTML into the DOM (there
 *   is no `dangerouslySetInnerHTML` anywhere in the path). This
 *   parser returns only the *text* of each segment; callers render
 *   those segments as React text children, so React escapes any
 *   `<`, `>`, `&` the content contained. A `<script>` tag stored in a
 *   note consequently renders as inert text, never as executable
 *   markup.
 *
 * Unterminated `<mark>`: a stray opening marker with no closing
 * partner is treated as plain text (the marker token itself is
 * dropped, the following text kept) so a malformed marker never
 * swallows the rest of the snippet and never leaks raw markup to the
 * user.
 */

/** One segment of a parsed FTS5 snippet: plain text or a highlighted
 *  match (`<mark>…</mark>` in the raw snippet). */
export interface SnippetPart {
  text: string;
  highlight: boolean;
}

const MARK_OPEN = "<mark>";
const MARK_CLOSE = "</mark>";

/** Parse an FTS5 snippet (`…plain <mark>match</mark> more…`) into an
 *  ordered list of plain and highlighted segments. The input is the
 *  raw `snippet` string from `/api/search`; callers handle the
 *  `null` / empty case before calling. Always returns at least one
 *  segment for a non-empty input. */
export function parseSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  const len = snippet.length;
  let cursor = 0;

  while (cursor < len) {
    const openIdx = snippet.indexOf(MARK_OPEN, cursor);
    if (openIdx === -1) {
      // No more marks — the remainder is plain text.
      parts.push({ text: snippet.slice(cursor), highlight: false });
      break;
    }
    if (openIdx > cursor) {
      parts.push({ text: snippet.slice(cursor, openIdx), highlight: false });
    }
    const markStart = openIdx + MARK_OPEN.length;
    const closeIdx = snippet.indexOf(MARK_CLOSE, markStart);
    if (closeIdx === -1) {
      // Unterminated <mark>: drop the marker token and keep the
      // following text as plain so content is never lost and no raw
      // `<mark>` reaches the user.
      parts.push({ text: snippet.slice(markStart), highlight: false });
      break;
    }
    parts.push({
      text: snippet.slice(markStart, closeIdx),
      highlight: true,
    });
    cursor = closeIdx + MARK_CLOSE.length;
  }

  return parts;
}
