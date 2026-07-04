"use client";

/**
 * Browse-page state hook.
 *
 * Owns four concerns:
 *
 *  1. **URL ⇄ filter state sync.** The active filter set is the URL
 *     query string — the page renders, the user picks a tab, the
 *     URL updates, and a refresh / back-button press reproduces the
 *     same view. `useSearchParams` + `useRouter` from
 *     `next/navigation` are the only I/O.
 *  2. **Debounced fetch.** Search input is debounced (300ms, per
 *     the design spec) so a typing user does not fire a request
 *     per keystroke. Other filters fire immediately.
 *  3. **Infinite scroll.** TanStack Query's `useInfiniteQuery` handles
 *     pagination. Each filter change resets the query cache and
 *     fetches page 1. `fetchNextPage` appends the next page to the
 *     existing items.
 *  4. **Request lifecycle.** TanStack Query manages request cancellation
 *     automatically when the query key changes. Errors land in `error`;
 *     success lands in `items` + `total`.
 *
 * The hook does not own the advanced-filters open/closed state
 * or the grid/list view — both are purely UI and live on the
 * toolbar / page components.
 *
 * Implementation note: `searchParams` is mirrored into local
 * `useState` so that an in-test `router.replace` (which does not
 * trigger a real React re-render) propagates through the hook.
 * In production, Next.js invalidates the page on `replace` and
 * `useSearchParams` returns the new value on the next render;
 * the local state mirrors the same value. The cost is a
 * `useEffect` per URL change — negligible for a single-user app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchBrowseItems, BrowseApiError } from "./api";
import { type BrowseFilters, type BrowseItem, coerceTypeTab } from "./types";
import { queryKeys, staleTimes } from "@/lib/query-config";

/** Debounce window for the search input. 300ms is the design spec. */
const SEARCH_DEBOUNCE_MS = 300;

/** Default page size — matches the default in `api.ts`. */
const PAGE_SIZE = 20;

export type BrowseStatus = "idle" | "loading" | "success" | "error";

export interface UseBrowseStateResult {
  /** The currently-active filter set, derived from the URL. */
  filters: BrowseFilters;
  /** Active type tab id, coerced to a valid tab. */
  typeTab: ReturnType<typeof coerceTypeTab>;
  /** Accumulated items across all loaded pages. */
  items: BrowseItem[];
  /** Total number of items matching the active filter set, as
   *  reported by the last successful response. */
  total: number;
  /** Request lifecycle state. `loading` is true for the very
   *  first request of a filter change; `success` once the first
   *  page arrives. Subsequent pages flip `isLoadingMore` instead. */
  status: BrowseStatus;
  /** Error message (user-safe) when `status === "error"`. */
  error: string | null;
  /** True while a debounce timer is pending (search input). */
  isSearchPending: boolean;
  /** True while a load-more request is in flight. Distinct from
   *  the initial-load `status === "loading"` so the feed can show
   *  a subtle "loading more" affordance instead of replacing the
   *  existing items with a skeleton. */
  isLoadingMore: boolean;
  /** True when more pages are available. */
  hasMore: boolean;
  /** Patch one or more filters. The URL is updated immediately. */
  setFilters: (patch: Partial<BrowseFilters>) => void;
  /** Reset every filter to the empty default and jump to page 1. */
  clearFilters: () => void;
  /** Manually retry the current request. */
  retry: () => void;
  /** Fetch the next page and append it to the existing items. */
  loadMore: () => void;
}

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

export function useBrowseState(): UseBrowseStateResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Mirror `searchParams` into local state so React tracks the
  // URL value and changes to it trigger a re-render. The hook
  // does an optimistic local update in `setFilters` too, but
  // this effect picks up changes that came in from elsewhere
  // (the back button, a shared link, the address bar).
  const [filters, setFiltersState] = useState<BrowseFilters>(() =>
    readFiltersFromParams(searchParams)
  );
  // The last `searchParams.toString()` we have synced into
  // local state. Comparing strings is cheap and lets us
  // ignore no-op replace calls.
  const lastSyncedRef = useRef(searchParams.toString());

  useEffect(() => {
    const next = searchParams.toString();
    if (next === lastSyncedRef.current) return;
    lastSyncedRef.current = next;
    setFiltersState(readFiltersFromParams(searchParams));
  }, [searchParams]);

  const typeTab = coerceTypeTab(filters.type);

  // Search has a 300ms debounce; the *committed* `q` (the one we
  // send to the API) lives in its own state. The input's local
  // value is owned by the toolbar — the hook only sees the value
  // it should *use*.
  const [committedQ, setCommittedQ] = useState(filters.q ?? "");
  const [isSearchPending, setIsSearchPending] = useState(false);

  // ---- URL → committedQ debounce ---------------------------------
  // When the URL's `q` changes, we mirror it into `committedQ` after
  // 300ms so the toolbar's local input stays in sync with the URL
  // (e.g. when the user hits the back button). We also commit
  // immediately on the first render so the initial fetch fires
  // without delay.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const incoming = filters.q ?? "";
    if (incoming === committedQ) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsSearchPending(true);
    debounceRef.current = setTimeout(() => {
      setCommittedQ(incoming);
      setIsSearchPending(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // We deliberately exclude `committedQ` from deps — the only
    // trigger is "URL changed". Including it would cause an
    // infinite update loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ---- TanStack Query: infinite query for browse items -----------
  // The query key includes all filters (including the committed search
  // query). When any filter changes, the query is invalidated and
  // refetched from page 1. TanStack Query handles request cancellation
  // automatically when the key changes.
  const queryKey = useMemo(
    () =>
      queryKeys.browse.list({
        q: committedQ,
        type: filters.type,
        tag: filters.tag,
        source: filters.source,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    [
      committedQ,
      filters.type,
      filters.tag,
      filters.source,
      filters.startDate,
      filters.endDate,
    ]
  );

  const {
    data,
    status: queryStatus,
    error: queryError,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) => {
      const requestFilters: BrowseFilters = { ...filters, q: committedQ };
      return fetchBrowseItems(requestFilters, {
        page: pageParam as number,
        limit: PAGE_SIZE,
      });
    },
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.limit);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: staleTimes.browse,
  });

  // Flatten pages into a single items array
  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  );

  // Total from the first page (all pages report the same total)
  const total = data?.pages[0]?.total ?? 0;

  // Map TanStack Query status to our BrowseStatus
  const status: BrowseStatus =
    queryStatus === "pending"
      ? "loading"
      : queryStatus === "error"
        ? "error"
        : "success";

  // User-safe error message
  const error = queryError
    ? queryError instanceof BrowseApiError
      ? "Couldn't load your brain right now. Please try again."
      : "Couldn't load your brain right now. Please try again."
    : null;

  // Derive hasMore from items.length vs total (matches original behavior).
  // TanStack Query's hasNextPage is based on pagination logic, but the
  // original hook derived it from the actual item count vs total, which
  // is more intuitive and matches the API's semantics.
  const hasMore = items.length < total;

  // ---- URL writers -----------------------------------------------
  // Patches are applied through `router.replace` so the back button
  // does not fill up with each filter tap. `scroll: false` keeps
  // the page from jumping to the top on every keystroke / tab
  // change.
  const writeFilters = useCallback(
    (next: BrowseFilters) => {
      const params = writeFiltersToParams(searchParams, next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  const setFilters = useCallback(
    (patch: Partial<BrowseFilters>) => {
      // Empty / whitespace strings drop the key entirely so a
      // cleared field does not show up in the URL.
      const cleaned: Partial<BrowseFilters> = {};
      for (const [k, v] of Object.entries(patch)) {
        const key = k as keyof BrowseFilters;
        if (v && v.trim()) cleaned[key] = v;
        else cleaned[key] = undefined;
      }
      const merged: BrowseFilters = { ...filters, ...cleaned };
      // No-op guard: if the patch produces no actual change, skip the
      // page reset and URL write so the feed does not refetch on a
      // no-op (e.g. re-clicking an already-applied date preset, or
      // blurring a date input you never edited).
      if (filtersEqual(merged, filters)) return;
      // Optimistic local update so the UI reflects the new
      // filter immediately, even before `searchParams` re-reads.
      setFiltersState(merged);
      writeFilters(merged);
    },
    [filters, writeFilters]
  );

  const clearFilters = useCallback(() => {
    setCommittedQ("");
    setFiltersState({});
    writeFilters({});
  }, [writeFilters]);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const loadMore = useCallback(() => {
    if (!hasMore || isFetchingNextPage) return;
    fetchNextPage();
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  return {
    filters: { ...filters, q: committedQ },
    typeTab,
    items,
    total,
    status,
    error,
    isSearchPending,
    isLoadingMore: isFetchingNextPage,
    hasMore,
    setFilters,
    clearFilters,
    retry,
    loadMore,
  };
}
