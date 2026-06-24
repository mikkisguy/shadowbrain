import { parseSnippet } from "@/lib/snippet";

/**
 * Render a FTS5 snippet as React nodes.
 *
 * The snippet returned by `/api/search` wraps matched terms in
 * `<mark>…</mark>`; the surrounding text is raw user content from
 * `content_items.content` and is **not** HTML-escaped by FTS5's
 * `snippet()`. Parsing + rendering is delegated to the shared
 * `parseSnippet` (src/lib/snippet.ts), which splits the snippet into
 * plain / highlight segments that are rendered as React text children
 * — so React escapes any markup and there is no
 * `dangerouslySetInnerHTML` in the path. See that module for the full
 * XSS rationale and the unterminated-`<mark>` handling.
 */
export function renderSnippet(snippet: string | null): React.ReactNode {
  if (!snippet) return null;

  const parts = parseSnippet(snippet);
  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={`m-${i}`}>{part.text}</mark>
        ) : (
          <span key={`t-${i}`}>{part.text}</span>
        )
      )}
    </>
  );
}

/**
 * Map a content-item `type` to the matching design-system
 * color token. Falls back to `--type-raw` for unknown types
 * so the palette still renders something. Each token is
 * already declared in `src/app/globals.css`.
 */
export function typeBadgeClasses(type: string): string {
  switch (type) {
    case "raw_text":
      return "bg-type-raw";
    case "image":
      return "bg-type-image";
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
