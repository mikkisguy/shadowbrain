"use client";

/**
 * Browse feed.
 *
 * Renders the four visual states the Browse page can be in:
 *   - **loading** — a neutral skeleton
 *   - **error** — a one-line message and "Try again"
 *   - **empty** — filter-aware "no results" copy
 *   - **success** — virtualized cards via `react-virtuoso`
 *
 * Two views:
 *   - `grid` — items split round-robin into N columns. Each column
 *     is independently virtualized so only visible cards render.
 *   - `list` — single-column, fully virtualized.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

import { Button } from "@/components/ui/button";
import { CelestialCluster } from "@/components/visual/celestial-motif";
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
  cardVariant?: "pill" | "larger-dot";
  onTagClick?: (tag: string) => void;
  infiniteScroll?: boolean;
}

const SKELETON_CARD_COUNT = 6;

function columnCountForWidth(width: number): number {
  if (width < 768) return 1;
  if (width < 1024) return 2;
  return 3;
}

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
  const handleEndReached = useCallback(() => {
    if (infiniteScroll && hasMore && !isLoadingMore) {
      onLoadMore();
    }
  }, [infiniteScroll, hasMore, isLoadingMore, onLoadMore]);

  // ---- Column-count derivation for the grid view -----------
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

  const gridColumns = useMemo(() => {
    if (!items || view !== "grid") return null;
    return roundRobin(items, gridColumnCount);
  }, [items, view, gridColumnCount]);

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
    return (
      <div
        data-testid="feed-loading"
        role="status"
        aria-label="Loading items"
        className="flex gap-3"
      >
        {roundRobin(
          Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => i),
          gridColumnCount
        ).map((bucket, ci) => (
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

  if (view === "grid" && gridColumns) {
    return (
      <div className="flex flex-col gap-6">
        <div
          ref={setGridEl}
          data-testid="feed"
          data-view="grid"
          aria-label="Browse feed"
          className="flex gap-3"
        >
          {gridColumns.map((col, ci) => (
            <div key={ci} className="flex min-w-0 flex-1">
              <Virtuoso
                data={col}
                useWindowScroll
                endReached={handleEndReached}
                itemContent={(_index, item) => cardRenderer(item)}
                components={{
                  List: ({ style, children, ...props }) => (
                    <div
                      {...props}
                      className="flex w-full flex-col gap-3"
                      style={style}
                    >
                      {children}
                    </div>
                  ),
                }}
              />
            </div>
          ))}
        </div>

        {/* Load-more affordance (for search / manual mode) */}
        <div data-testid="feed-sentinel" aria-hidden className="h-px w-full" />
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

  // ---- List view: single-column virtualized list -------------
  return (
    <div className="flex flex-col gap-6">
      <Virtuoso
        data={items}
        useWindowScroll
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

      <div data-testid="feed-sentinel" aria-hidden className="h-px w-full" />
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
