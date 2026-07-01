"use client";

/**
 * Browse feed.
 *
 * Renders the four visual states the Browse page can be in:
 *   - **loading** (first paint, no data yet) — a neutral skeleton
 *     so the layout reserves space
 *   - **error** — a one-line message and a "Try again" button
 *   - **empty** — a friendly "no results" line tuned to the active
 *     filter set (e.g. "No journal entries match these filters" vs
 *     "Your second brain is empty")
 *   - **success** — the card list, with an `IntersectionObserver`
 *     sentinel at the bottom that triggers `loadMore` when the
 *     viewport reaches the end of the list
 *
 * The feed supports two views via a simple flex-column masonry:
 *   - `grid` (default) — items are split round-robin into N
 *     columns (N derived from the container width). Each column
 *     is an independent flex column so cards sit with their
 *     natural height and pack vertically — cards keep varying
 *     heights and stack flush, like a Pinterest wall. Ordering is
 *     left-to-right (item 0 → column 0, item 1 → column 1, …),
 *     which keeps the chronological timestamp order intact.
 *
 *     Each column carries `min-w-0`. Without it, a flex item's
 *     default `min-width: auto` resolves to its widest card's
 *     min-content (a long unbreakable token or a wide image), so
 *     one column would balloon to ~40% while the others shrank —
 *     the "messed-up columns" bug. `min-w-0` lets `flex-1` hold
 *     every column at an equal 1/N share; the card itself breaks
 *     long tokens with `break-words`, so nothing overflows.
 *   - `list` — single-column wide row.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContentCard } from "./content-card";
import type { BrowseItem, BrowseView } from "./types";

export interface ContentFeedProps {
  items: BrowseItem[] | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  onRetry: () => void;
  hasActiveFilters: boolean;
  view: BrowseView;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  /** Per-card type-indicator treatment. The feed passes this
   *  straight through to every `ContentCard` it renders. The
   *  default (`"larger-dot"`) keeps the editorial dot, just
   *  bumped to 2.5 px; `"pill"` turns the header into a filled
   *  coloured chip. */
  cardVariant?: "pill" | "larger-dot";
  /** Called when a card's tag pill is clicked. The page wires this
   *  to `setFilters({ tag })` so a click narrows the feed and the
   *  URL picks up `?tag=…`. */
  onTagClick?: (tag: string) => void;
  /** Whether the scroll-triggered auto-load (the IntersectionObserver
   *  on the sentinel) is active. Disabled during an active search so
   *  results appear as a finite set "replacing infinite scroll" (issue
   *  #24); a manual "Load more" button still paginates if `hasMore`.
   *  Defaults to `true` (the normal browse feed). */
  infiniteScroll?: boolean;
}

const SKELETON_CARD_COUNT = 6;

/** Breakpoints for column count — mirrors the tailwind `md:` and
 *  `lg:` thresholds the rest of the design system uses. Mobile stays
 *  a single column up to 768px (md) per the responsive spec. */
function columnCountForWidth(width: number): number {
  if (width < 768) return 1;
  if (width < 1024) return 2;
  return 3;
}

/** Split an array round-robin into `n` buckets. Item 0 → bucket 0,
 *  item 1 → bucket 1, …, item n → bucket 0, etc. This preserves
 *  the original chronological order left-to-right across columns. */
function roundRobin<T>(arr: readonly T[], n: number): T[][] {
  if (n <= 1) return [arr.slice()];
  const buckets: T[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < arr.length; i++) {
    buckets[i % n].push(arr[i]);
  }
  return buckets;
}

export function ContentFeed({
  items,
  status,
  error,
  onRetry,
  hasActiveFilters,
  view,
  isLoadingMore,
  hasMore,
  onLoadMore,
  cardVariant = "larger-dot",
  onTagClick,
  infiniteScroll = true,
}: ContentFeedProps) {
  // ---- Column-count derivation for the masonry grid -----------
  // The grid node is absent on the first render — the feed returns
  // `null` (status "idle", items empty) until the first page
  // arrives, so a one-shot mount effect can't measure it (the ref is
  // null at mount and the `[]`-dep effect bails, leaving the count
  // stuck at its default — the "always 3 columns" bug). We track the
  // node via a callback ref and (re)bind the ResizeObserver whenever
  // it actually mounts, and seed the count from the viewport width so
  // the grid's first appearance is already at the right column count
  // (no 3-column flash on mobile). The grid is never part of the SSR
  // HTML (items are empty on the server), so reading `window.innerWidth`
  // in the initializer is hydration-safe.
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridColumnCount, setGridColumnCount] = useState(() =>
    typeof window === "undefined" ? 3 : columnCountForWidth(window.innerWidth)
  );
  useEffect(() => {
    if (!gridEl) return;
    const update = () =>
      setGridColumnCount(columnCountForWidth(gridEl.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(gridEl);
    return () => observer.disconnect();
  }, [gridEl]);

  // ---- Masonry columns for the grid view ----------------------
  // Items are split round-robin so item ordering is L-to-R
  // (first item → left column, second item → middle column, …).
  // Each column is an independent flex column — cards sit with
  // their natural height and pack vertically.
  const masonryColumns = useMemo(() => {
    if (!items || view !== "grid") return null;
    return roundRobin(items, gridColumnCount);
  }, [items, view, gridColumnCount]);

  // ---- Infinite-scroll sentinel -------------------------------
  // Disabled during an active search (`infiniteScroll === false`):
  // the observer is not attached, so scrolling to the bottom does
  // not auto-fetch the next page. A manual "Load more" button below
  // still paginates, so search results are never cut off — only the
  // scroll-triggered auto-load (the "infinite scroll") is suspended.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!infiniteScroll) return;
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLoadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, infiniteScroll]);

  if (status === "error") {
    return (
      <div
        data-testid="feed-error"
        className="border-border bg-surface-elevated flex flex-col items-start gap-3 rounded-sm border p-6"
      >
        <p className="text-error font-sans text-sm font-medium">
          {error ?? "Couldn't load your brain right now."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          data-testid="feed-retry"
        >
          Try again
        </Button>
      </div>
    );
  }

  if (status === "loading" && (!items || items.length === 0)) {
    // Loading skeleton: same visual columns as the grid view so
    // the layout reserves the right space.
    const skelCols = roundRobin(
      Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => i),
      gridColumnCount
    );
    return (
      <div
        data-testid="feed-loading"
        role="status"
        aria-label="Loading items"
        ref={setGridEl}
        className="flex gap-3"
      >
        {skelCols.map((bucket, ci) => (
          // `min-w-0` keeps the skeleton columns at an equal 1/N
          // width, matching the success-state masonry below.
          <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
            {bucket.map((i) => (
              <div
                key={i}
                className="border-border bg-surface-elevated flex flex-col gap-3 overflow-hidden rounded-sm border"
              >
                <div className="bg-surface-muted aspect-video w-full" />
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="bg-surface-muted h-3 w-16 rounded-sm" />
                    <div className="bg-surface-muted h-3 w-12 rounded-sm" />
                  </div>
                  <div className="bg-surface-muted h-5 w-3/4 rounded-sm" />
                  <div className="flex flex-col gap-1.5">
                    <div className="bg-surface-muted h-3 w-full rounded-sm" />
                    <div className="bg-surface-muted h-3 w-5/6 rounded-sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (status === "success" && items && items.length === 0) {
    return (
      <div
        data-testid="feed-empty"
        className="border-border bg-surface-elevated/40 flex flex-col gap-2 rounded-sm border border-dashed p-8 text-center"
      >
        <p className="text-foreground font-sans text-base font-medium">
          {hasActiveFilters
            ? "No items match these filters"
            : "Your second brain is empty"}
        </p>
        <p className="text-muted-foreground font-sans text-sm">
          {hasActiveFilters
            ? "Try clearing a filter or broadening the date range."
            : "Add a note, a journal entry, or a bookmark to get started."}
        </p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  // ---- Grid view: masonry columns (flex) ----------------------
  if (view === "grid" && masonryColumns) {
    return (
      <div className="flex flex-col gap-6">
        <div
          ref={setGridEl}
          data-testid="feed"
          data-view="grid"
          aria-label="Browse feed"
          className="flex gap-3"
        >
          {masonryColumns.map((col, ci) => (
            <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
              {col.map((item) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  tags={item.tags}
                  variant={cardVariant}
                  onTagClick={onTagClick}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Infinite-scroll sentinel + load-more affordance */}
        <div
          ref={sentinelRef}
          data-testid="feed-sentinel"
          aria-hidden
          className="h-px w-full"
        />
        <div
          data-testid="feed-load-more"
          className="text-muted-foreground flex flex-col items-center gap-1 py-4 font-sans text-xs"
        >
          {isLoadingMore ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              <span>Loading more…</span>
            </span>
          ) : hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              data-testid="feed-load-more-button"
              className="hover:text-foreground focus-visible:ring-ring rounded-sm px-3 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              Load more
            </button>
          ) : (
            <span data-testid="feed-end">{"That's everything."}</span>
          )}
        </div>
      </div>
    );
  }

  // ---- List view: single-column list --------------------------
  return (
    <div className="flex flex-col gap-6">
      <ul
        data-testid="feed"
        data-view="list"
        aria-label="Browse feed"
        className="flex flex-col gap-3"
      >
        {items.map((item) => (
          <li key={item.id}>
            <ContentCard
              item={item}
              tags={item.tags}
              variant={cardVariant}
              onTagClick={onTagClick}
            />
          </li>
        ))}
      </ul>

      <div
        ref={sentinelRef}
        data-testid="feed-sentinel"
        aria-hidden
        className="h-px w-full"
      />
      <div
        data-testid="feed-load-more"
        className="text-muted-foreground flex flex-col items-center gap-1 py-4 font-sans text-xs"
      >
        {isLoadingMore ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            <span>Loading more…</span>
          </span>
        ) : hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            data-testid="feed-load-more-button"
            className="hover:text-foreground focus-visible:ring-ring rounded-sm px-3 py-1 focus-visible:ring-2 focus-visible:outline-none"
          >
            Load more
          </button>
        ) : (
          <span data-testid="feed-end">{"That's everything."}</span>
        )}
      </div>
    </div>
  );
}
