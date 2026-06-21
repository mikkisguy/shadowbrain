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
 *  3. **Infinite scroll.** Each filter change resets the page
 *     to 1 and clears the accumulated items. A `loadMore`
 *     callback appends the next page to the existing list,
 *     driven by an `IntersectionObserver` on a sentinel element
 *     in the feed.
 *  4. **Request lifecycle.** Each fetch (initial or loadMore)
 *     cancels the previous in-flight request via
 *     `AbortController` and ignores the response of any
 *     cancelled fetch. Errors land in `error`; success lands
 *     in `items` + `total`.
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

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { fetchBrowseItems, BrowseApiError } from "./api";
import { type BrowseFilters, type BrowseItem, coerceTypeTab } from "./types";

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

  // Accumulated items across pages. Reset on filter change.
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [total, setTotal] = useState(0);
  // The highest page that has been *fully loaded*; loadMore reads
  // `nextPage` from this and writes back when the response
  // arrives. A version counter (see the fetch effect below) keys
  // stale responses out so a filter change during a loadMore
  // doesn't corrupt the accumulated list.
  const [loadedPage, setLoadedPage] = useState(0);
  // True once any fetch (initial or loadMore) has resolved —
  // success or error. Drives the status derivation: a `pending`
  // count > 0 with `hasFetched === false` is "loading";
  // `hasFetched === true` is "success" (or "error"). Without
  // this flag a successful-but-empty response would render as
  // "idle" because `items.length === 0` and `pending === 0`.
  const [hasFetched, setHasFetched] = useState(false);
  // Pending fetch count. Bumped on every fetch effect, decremented
  // when the matching promise resolves. Tracked as state (not a
  // ref) because the status is derived from it during render and
  // the linter forbids reading refs during render.
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // `isLoadingMore` is a derived flag, but we still need a state
  // slot for it because the initial-load `status === "loading"`
  // and the loadMore indicator are different visual states.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  // A version counter that bumps on every fetch. The fetch effect
  // captures the value at request time; the .then / .catch check
  // it against the latest commit and bail if the request was
  // superseded by a later filter change. This is what lets us
  // avoid clobbering `items` from a stale request.
  const latestVersionRef = useRef(0);

  // ---- Page state setters ----------------------------------------
  // `setPage(1)` resets the accumulated list and triggers a fresh
  // fetch on page 1. The fetch effect reads `pageToFetchRef` to
  // decide what to load; the ref is updated here so the next
  // effect run picks up the new page.
  //
  // Declared before the debounce effect so the debounce can call
  // it (the linter rejects forward references to `setPage`).
  const setPage = useCallback((next: number) => {
    if (next === 1) {
      // Filter change → reset everything.
      setItems([]);
      setTotal(0);
      setLoadedPage(0);
      setHasFetched(false);
      setError(null);
      pageToFetchRef.current = 1;
    } else {
      pageToFetchRef.current = next;
    }
  }, []);

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
      setPage(1);
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

  // ---- Fetch effect -----------------------------------------------
  // The effect's behaviour depends on the *page-to-fetch* signal:
  //   - `page === 0` → reset and fetch page 1 (initial load for a
  //     filter change; `loadedPage` starts at 0)
  //   - `page > loadedPage` → fetch the next page and append
  //
  // The effect itself reads `page` from a ref (see below) to
  // avoid an effect-cascade where every state update retriggers
  // the effect.
  const pageToFetchRef = useRef(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    const version = latestVersionRef.current + 1;
    latestVersionRef.current = version;
    setPending((p) => p + 1);

    const pageToFetch = pageToFetchRef.current;
    const isLoadMore = pageToFetch > 0;
    if (isLoadMore) {
      setIsLoadingMore(true);
    }

    const requestFilters: BrowseFilters = { ...filters, q: committedQ };

    fetchBrowseItems(requestFilters, {
      page: Math.max(1, pageToFetch),
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
      .then((response) => {
        if (latestVersionRef.current !== version) return;
        setIsLoadingMore(false);
        setItems((prev) =>
          isLoadMore ? [...prev, ...response.items] : response.items
        );
        setTotal(response.total);
        // The loaded page is the page that was actually fetched
        // (pageToFetch is 0 for the initial request, so we use
        // the response's page instead).
        setLoadedPage(response.page);
        setHasFetched(true);
        // Clear any prior error on a successful fetch.
        if (!isLoadMore) setError(null);
        setPending((p) => Math.max(0, p - 1));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          setPending((p) => Math.max(0, p - 1));
          return;
        }
        if (latestVersionRef.current !== version) {
          setPending((p) => Math.max(0, p - 1));
          return;
        }
        setIsLoadingMore(false);
        setPending((p) => Math.max(0, p - 1));
        if (err instanceof BrowseApiError) {
          setError("Couldn't load your brain right now. Please try again.");
          setHasFetched(true);
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError("Couldn't load your brain right now. Please try again.");
        setHasFetched(true);
      });

    return () => {
      controller.abort();
    };
    // We intentionally do not depend on `filters` directly — the
    // individual fields are listed. The linter wants `filters`
    // here; including it would change the dep array reference on
    // every render (filters is a new object every time) and
    // cause a fetch-loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    committedQ,
    filters.type,
    filters.tag,
    filters.source,
    filters.startDate,
    filters.endDate,
    retryToken,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Status is derived from the request lifecycle:
  //   - `error` wins (we surfaced a user-safe message)
  //   - `hasFetched` → "success" (the request completed; the
  //     feed's empty / success branch handles the rest)
  //   - `pending > 0` and we have not fetched yet → "loading"
  //   - otherwise → "idle" (the page has not asked for anything
  //     yet; this only happens for one render cycle on first
  //     mount)
  const status: BrowseStatus = error
    ? "error"
    : hasFetched
      ? "success"
      : pending > 0
        ? "loading"
        : "idle";

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
      // Any non-search filter change resets the page.
      const resetPage = Object.keys(patch).some((k) => k !== "q");
      if (resetPage) {
        setPage(1);
        setCommittedQ(merged.q ?? "");
      }
      // Optimistic local update so the UI reflects the new
      // filter immediately, even before `searchParams` re-reads.
      setFiltersState(merged);
      writeFilters(merged);
    },
    [filters, setPage, writeFilters]
  );

  const clearFilters = useCallback(() => {
    setPage(1);
    setCommittedQ("");
    setFiltersState({});
    writeFilters({});
  }, [setPage, writeFilters]);

  /* eslint-disable react-hooks/immutability */
  const retry = useCallback(() => {
    setItems([]);
    setTotal(0);
    setLoadedPage(0);
    setHasFetched(false);
    setError(null);
    pageToFetchRef.current = 1;
    setRetryToken((n) => n + 1);
  }, []);
  /* eslint-enable react-hooks/immutability */

  /* eslint-disable react-hooks/immutability */
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    pageToFetchRef.current = loadedPage + 1;
    // Bump a fresh version so the load-more request doesn't get
    // keyed out by a stale ref.
    latestVersionRef.current += 1;
    setRetryToken((n) => n + 1);
  }, [hasMore, isLoadingMore, loadedPage]);
  /* eslint-enable react-hooks/immutability */

  return {
    filters: { ...filters, q: committedQ },
    typeTab,
    items,
    total,
    status,
    error,
    isSearchPending,
    isLoadingMore,
    hasMore,
    setFilters,
    clearFilters,
    retry,
    loadMore,
  };
}
