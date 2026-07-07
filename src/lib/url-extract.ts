// URL extraction helpers for bookmark content.
// Finds the first http(s) URL in a string and cleans
// surrounding punctuation artefacts.

/**
 * Find the first http(s) URL in `content`. Returns null when none is
 * found. Surrounding punctuation (e.g. trailing `)` or `,`) is stripped
 * so common copy-paste artefacts don't poison the URL.
 */
export function extractFirstUrl(content: string): string | null {
  const match = content.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  return stripTrailingPunctuation(match[0]);
}

function stripTrailingPunctuation(url: string): string {
  // Drop a single trailing punctuation char that's almost never part of
  // a URL. We loop because a sentence can end in ".)" or similar.
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (ch === ")" || ch === "]" || ch === "," || ch === ".") {
      // Keep balanced: a `(` without a matching `)` should not be
      // stripped (it means the URL itself contains a paren). Cheap
      // heuristic: only strip the trailing char if the matching
      // opener isn't also inside the URL.
      const open = ch === ")" ? "(" : ch === "]" ? "[" : null;
      if (open && url.slice(0, end - 1).includes(open)) {
        break;
      }
      end--;
      continue;
    }
    if (ch === ";" || ch === ":") {
      // Drop a trailing `;` or `:` that is the end of an HTML entity or
      // sentence, not a URL component. (URLs ending in `:` are not
      // meaningful; URLs ending in `;` only appear as a query separator
      // in the middle.)
      end--;
      continue;
    }
    break;
  }
  return url.slice(0, end);
}
