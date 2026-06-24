/**
 * Tag utilities.
 *
 * Shared helpers for parsing and handling tag strings across the
 * browse page and the database layer.
 */

/** Split a comma-separated `tag` filter string into individual tag
 *  names. Trims whitespace and drops empties so `"a,, b "` becomes
 *  `["a", "b"]`. Used by the browse page's advanced-filters panel and
 *  the database query helpers to support multi-tag OR filtering. */
export function splitTags(tag: string): string[] {
  return tag
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
