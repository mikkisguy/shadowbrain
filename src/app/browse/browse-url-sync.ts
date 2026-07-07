import type { BrowseFilters } from "./types";

const FILTER_KEYS = [
  "q",
  "type",
  "tag",
  "source",
  "startDate",
  "endDate",
] as const;

/** Shallow equality for two filter sets. Values are strings or
 *  undefined, so normalising `undefined` to `""` lets a direct
 *  string comparison cover every key. Used by `setFilters` to bail
 *  out when a patch does not actually change anything — e.g. clicking
 *  a date preset that is already applied, or blurring a date input
 *  without editing it. Without this guard a no-op patch would still
 *  reset the page and re-fetch. */
function filtersEqual(a: BrowseFilters, b: BrowseFilters): boolean {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = a[key as keyof BrowseFilters] ?? "";
    const bv = b[key as keyof BrowseFilters] ?? "";
    if (av !== bv) return false;
  }
  return true;
}

/** Parse a `URLSearchParams` value into a `BrowseFilters`. Empty
 *  strings collapse to `undefined` so the API helper can drop them. */
function readFiltersFromParams(params: URLSearchParams): BrowseFilters {
  const filters: BrowseFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value && value.trim()) filters[key] = value;
  }
  return filters;
}

/** Serialise a `BrowseFilters` back into `URLSearchParams`,
 *  preserving any non-filter params (e.g. `from=…` set by the
 *  login redirect). The `page` is the *browse* page, not a URL
 *  query param — pagination is owned by the hook state, not the
 *  URL, so a refresh always lands on page 1. */
function writeFiltersToParams(
  base: URLSearchParams,
  filters: BrowseFilters
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value && value.trim()) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }
  return next;
}

export {
  FILTER_KEYS,
  filtersEqual,
  readFiltersFromParams,
  writeFiltersToParams,
};
