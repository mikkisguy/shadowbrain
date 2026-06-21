/**
 * Render a FTS5 snippet as React nodes.
 *
 * The snippet returned by `/api/search` is an HTML fragment
 * where matched terms are wrapped in `<mark>...</mark>`. The
 * surrounding text is raw user-imported content (from
 * `content_items.content`) and may contain `<`, `&`, quotes,
 * etc. — the FTS5 `snippet()` function does *not* HTML-escape
 * its input.
 *
 * The naive `dangerouslySetInnerHTML` is therefore unsafe:
 * an attacker who could land `<script>` in a note would get
 * it executed in the palette. We avoid that by parsing the
 * snippet ourselves: split on the literal `<mark>` /
 * `</mark>` tokens and render alternating text / mark runs as
 * React nodes, letting React handle the escaping.
 *
 * The function is intentionally small and dependency-free; it
 * is the only HTML-interpolation site in the command palette.
 */
export function renderSnippet(snippet: string | null): React.ReactNode {
  if (!snippet) return null;

  const parts: React.ReactNode[] = [];
  const tokens = ["<mark>", "</mark>"];
  let cursor = 0;
  let partIdx = 0;
  let inMark = false;

  while (cursor < snippet.length) {
    const nextToken = tokens[inMark ? 1 : 0];
    const nextIdx = snippet.indexOf(nextToken, cursor);
    if (nextIdx === -1) {
      // No more markers; the rest is plain text. React will
      // escape the string at render time.
      parts.push(<span key={`t-${partIdx++}`}>{snippet.slice(cursor)}</span>);
      break;
    }
    if (nextIdx > cursor) {
      parts.push(
        <span key={`t-${partIdx++}`}>{snippet.slice(cursor, nextIdx)}</span>
      );
    }
    cursor = nextIdx + nextToken.length;
    inMark = !inMark;
    if (inMark) {
      // Consume the text run *inside* the mark element. We
      // re-enter the loop on the next iteration and look for
      // the closing token, rendering the captured text as a
      // single <mark> child.
      const closeIdx = snippet.indexOf("</mark>", cursor);
      if (closeIdx === -1) {
        // Unterminated <mark> — treat the rest as plain text
        // to avoid swallowing content.
        parts.push(<span key={`t-${partIdx++}`}>{snippet.slice(cursor)}</span>);
        cursor = snippet.length;
        break;
      }
      parts.push(
        <mark key={`m-${partIdx++}`}>{snippet.slice(cursor, closeIdx)}</mark>
      );
      cursor = closeIdx + "</mark>".length;
      inMark = false;
    }
  }

  return <>{parts}</>;
}

/**
 * Map a content-item `type` to the matching design-system
 * color token. Falls back to `--type-raw` for unknown types
 * so the palette still renders something. Each token is
 * already declared in `src/app/globals.css`.
 */
export function typeBadgeClasses(type: string): string {
  switch (type) {
    case "note":
      return "bg-type-note";
    case "bookmark":
      return "bg-type-bookmark";
    case "journal":
      return "bg-type-journal";
    case "question":
      return "bg-type-question";
    case "project":
      return "bg-type-project";
    case "person":
      return "bg-type-person";
    case "event":
      return "bg-type-event";
    case "dream":
      return "bg-type-dream";
    case "raw":
    default:
      return "bg-type-raw";
  }
}
