"use client";

/**
 * Browse-page state hook.
 *
 * Owns three concerns:
 *
 *  1. **URL ⇄ filter state sync.** The active filter set is the URL
 *     query string — the page renders, the user picks a tab, the
 *     URL updates, and a refresh / back-button press reproduces the
 *     same view. `useSearchParams` + `useRouter` from
 *     `next/navigation` are the only I/O.
 *  2. **Debounced fetch.** Search input is debounced (300ms, per
 *     the design spec) so a typing user does not fire a request
 *     per keystroke. Other filters fire immediately.
 *  3. **Request lifecycle.** Each filter change cancels the
 *     previous in-flight request via `AbortController` and ignores
 *     the response of any cancelled fetch. Errors land in
 *     `error`; success lands in `data`.
 *
 * The hook does not own the advanced-filters open/closed state —
 * that is purely UI, and lives on the toolbar component. The
 * "active" filter set (which the toolbar reads to highlight chips)
 * is derived from the URL.
 *
 * Implementation note: `searchParams` is mirrored into a local
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
import {
  type BrowseFilters,
  type BrowseResponse,
  coerceTypeTab,
} from "./types";

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
  /** The current page (1-based). */
  page: number;
  /** Latest successful response, or `null` if not yet loaded. */
  data: BrowseResponse | null;
  /** Request lifecycle state. */
  status: BrowseStatus;
  /** Error message (user-safe) when `status === "error"`. */
  error: string | null;
  /** True while a debounce timer is pending (search input). */
  isSearchPending: boolean;
  /** Patch one or more filters. The URL is updated immediately. */
  setFilters: (patch: Partial<BrowseFilters>) => void;
  /** Reset every filter to the empty default and jump to page 1. */
  clearFilters: () => void;
  /** Manually retry the current request. */
  retry: () => void;
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

  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pending fetch count. Bumped on every fetch effect, decremented
  // when the matching promise resolves. Tracked as state (not a
  // ref) because the status is derived from it during render and
  // the linter forbids reading refs during render.
  const [pending, setPending] = useState(0);
  const [page, setPage] = useState(1);
  const [retryToken, setRetryToken] = useState(0);
  // A version counter that bumps on every fetch. The fetch effect
  // captures the value at request time; the .then / .catch check
  // it against the latest commit and bail if the request was
  // superseded by a later filter change. This is what lets us
  // avoid clobbering `data` from a stale request.
  const latestVersionRef = useRef(0);

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
  // Cancels the previous request on every filter / page change.
  // The hook ignores any error or response from a cancelled fetch
  // so an aborted request cannot leave `status` stuck in
  // "loading".
  //
  // The `pending` state is bumped in this effect (the only way to
  // mark "a fetch is in flight"); it is decremented in the
  // promise's `.then` / `.catch`, which run *outside* the effect
  // body. The linter's `set-state-in-effect` rule is a useful
  // default but a false positive here: the bump is the only
  // signal the render pass has to derive `status`, and
  // suppressing it leaves the UI stuck in the previous state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    const version = latestVersionRef.current + 1;
    latestVersionRef.current = version;
    setPending((p) => p + 1);

    const requestFilters: BrowseFilters = { ...filters, q: committedQ };

    fetchBrowseItems(requestFilters, {
      page,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
      .then((response) => {
        if (latestVersionRef.current !== version) return;
        setData(response);
        setError(null);
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
        setPending((p) => Math.max(0, p - 1));
        if (err instanceof BrowseApiError) {
          setError("Couldn't load your brain right now. Please try again.");
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError("Couldn't load your brain right now. Please try again.");
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
    page,
    retryToken,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Derive the lifecycle status from the pending count and the
  // latest data / error.
  const status: BrowseStatus = error
    ? "error"
    : pending > 0 && !data
      ? "loading"
      : data
        ? "success"
        : "idle";

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
      if (resetPage) setPage(1);
      // Optimistic local update so the UI reflects the new
      // filter immediately, even before `searchParams` re-reads.
      setFiltersState(merged);
      writeFilters(merged);
    },
    [filters, writeFilters]
  );

  const clearFilters = useCallback(() => {
    setPage(1);
    setCommittedQ("");
    setFiltersState({});
    writeFilters({});
  }, [writeFilters]);

  const retry = useCallback(() => {
    setRetryToken((n) => n + 1);
  }, []);

  return {
    filters: { ...filters, q: committedQ },
    typeTab,
    page,
    data,
    status,
    error,
    isSearchPending,
    setFilters,
    clearFilters,
    retry,
  };
}
