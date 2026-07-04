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
 * Two views:
 *   - `grid` — items grouped into rows of N cards. A single
 *     `Virtuoso` instance virtualizes the rows. CSS grid inside
 *     each row lays out the cards side by side.
 *   - `list` — single-column, fully virtualized.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CelestialCluster } from "@/components/visual/celestial-motif";
import { ContentCard } from "./content-card";
import type { BrowseItem, BrowseView } from "./types";

import { Virtuoso } from "react-virtuoso";

/** Extra pixels rendered above and below the viewport so the
 *  browser has time to paint before items scroll into view.
 *  Shared by both the grid and list Virtuoso instances. */
const VIEWPORT_OVERSCAN_PX = 1200;

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
  // ---- Column-count derivation for the grid -----------
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

  /** Items chunked into rows of N for the single-Virtuoso grid view.
   *  Null when the grid view is not active (avoids unnecessary array work). */
  const gridRows = useMemo(() => {
    if (!items || view !== "grid" || items.length === 0) return null;
    const rows: BrowseItem[][] = [];
    for (let i = 0; i < items.length; i += gridColumnCount) {
      rows.push(items.slice(i, i + gridColumnCount));
    }
    return rows;
  }, [items, view, gridColumnCount]);

  // ---- Infinite-scroll sentinel -------------------------------
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

  const handleEndReached = () => {
    if (!isLoadingMore && hasMore && infiniteScroll) {
      onLoadMore();
    }
  };

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

  // Loading skeleton
  if (status === "loading" && (!items || items.length === 0)) {
    return (
      <div
        data-testid="feed-loading"
        role="status"
        aria-label="Loading items"
        ref={setGridEl}
        className="flex gap-3"
      >
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
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
    );
  }

  if (status === "success" && items && items.length === 0) {
    return (
      <div
        data-testid="feed-empty"
        className="border-border bg-surface-elevated/40 flex flex-col gap-2 rounded-sm border border-dashed p-8 text-center"
      >
        <CelestialCluster className="mb-1 opacity-70" />
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

  // ---- Success: virtualized grid or list ---------------------

  const cardRenderer = (item: BrowseItem) => (
    <ContentCard
      key={item.id}
      item={item}
      tags={item.tags}
      variant={cardVariant}
      onTagClick={onTagClick}
    />
  );

  // Grid view: single Virtuoso chunked rows of N items per row
  if (view === "grid" && gridRows) {
    return (
      <div className="flex flex-col gap-6">
        <div
          ref={setGridEl}
          data-testid="feed"
          data-view="grid"
          aria-label="Browse feed"
        >
          <Virtuoso
            data={gridRows}
            useWindowScroll
            increaseViewportBy={{
              top: VIEWPORT_OVERSCAN_PX,
              bottom: VIEWPORT_OVERSCAN_PX,
            }}
            endReached={handleEndReached}
            computeItemKey={(_index, row) => row[0].id}
            itemContent={(_index, row) => (
              <div
                className="mb-3 grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${gridColumnCount}, minmax(0, 1fr))`,
                }}
              >
                {row.map((item) => cardRenderer(item))}
              </div>
            )}
            components={{
              List: ({ style, children, ...props }) => (
                <div {...props} style={style}>
                  {children}
                </div>
              ),
            }}
          />
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

  // ---- List view: single-column virtualized list --------------------------
  return (
    <div className="flex flex-col gap-6">
      <Virtuoso
        data={items}
        useWindowScroll
        increaseViewportBy={{
          top: VIEWPORT_OVERSCAN_PX,
          bottom: VIEWPORT_OVERSCAN_PX,
        }}
        endReached={handleEndReached}
        components={{
          List: ({ style, children, ...props }) => (
            <div
              {...props}
              data-testid="feed"
              data-view="list"
              aria-label="Browse feed"
              className="flex flex-col gap-3"
              style={style}
            >
              {children}
            </div>
          ),
        }}
        itemContent={(_index, item) => cardRenderer(item)}
      />

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
