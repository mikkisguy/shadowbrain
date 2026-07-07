/**
 * Pure filter/sort helpers for the Tags page.
 */

import type { TagSort, TagWithCount } from "./types";

/** Client-side usage filter. */
export type UsageFilter = "all" | "unused";

/**
 * Sort tags by name or count, ascending or descending.
 * Returns a new array — does not mutate the input.
 */
export function sortTags(tags: TagWithCount[], sort: TagSort): TagWithCount[] {
  const sorted = [...tags].sort((a, b) => {
    if (sort.field === "count") {
      if (a.count !== b.count) return a.count - b.count;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return sort.direction === "desc" ? sorted.reverse() : sorted;
}

/**
 * Filter tags by a search query and/or the unused-only filter.
 */
export function filterTags(
  tags: TagWithCount[],
  query: string,
  usageFilter: UsageFilter
): TagWithCount[] {
  let result = tags;
  if (usageFilter === "unused") {
    result = result.filter((tag) => tag.count === 0);
  }
  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter((tag) => tag.name.toLowerCase().includes(q));
  }
  return result;
}
