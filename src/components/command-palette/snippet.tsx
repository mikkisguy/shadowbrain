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
 * Map a content-item `type` to the matching design-system colour
 * utility (`bg-type-*`). Delegates to the canonical `typeColorClass`
 * in `src/lib/content-types.ts`; re-exported here under the legacy
 * `typeBadgeClasses` name so existing importers are undisturbed.
 */
export { typeColorClass as typeBadgeClasses } from "@/lib/content-types";
