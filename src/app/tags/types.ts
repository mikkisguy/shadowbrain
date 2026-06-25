/**
 * Shared types for the Tags page.
 *
 * `TagWithCount` mirrors the row shape returned by
 * `GET /api/tags` (the `listWithCounts` repository helper):
 * the tag plus a `count` of how many content items reference it.
 */

export interface TagWithCount {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  count: number;
}

/** Field the list is sorted by. */
export type TagSortField = "name" | "count";

/** Sort direction. */
export type TagSortDirection = "asc" | "desc";

export interface TagSort {
  field: TagSortField;
  direction: TagSortDirection;
}
