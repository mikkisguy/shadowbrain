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

import { Loader2 } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

import { ContentCard } from "./content-card";
import { FeedEmpty, FeedError, FeedLoading } from "./feed-states";
import { useVirtualFeed } from "./use-virtual-feed";
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
  /** Called when a card is clicked (regular left-click). The page
   *  wires this to open the item preview sheet. Ctrl/Cmd+Click and
   *  middle-click pass through to the native <Link> behaviour (open
   *  in new tab). */
  onItemClick?: (id: string) => void;
  /** Whether the scroll-triggered auto-load (the IntersectionObserver
   *  on the sentinel) is active. Disabled during an active search so
   *  results appear as a finite set "replacing infinite scroll" (issue
   *  #24); a manual "Load more" button still paginates if `hasMore`.
   *  Defaults to `true` (the normal browse feed). */
  infiniteScroll?: boolean;
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
  onItemClick,
  infiniteScroll = true,
}: ContentFeedProps) {
  const {
    setGridEl,
    gridColumnCount,
    gridRows,
    sentinelRef,
    handleEndReached,
    VIEWPORT_OVERSCAN_PX,
  } = useVirtualFeed({
    items,
    view,
    infiniteScroll,
    hasMore,
    isLoadingMore,
    onLoadMore,
  });

  // ---- Early return states --------------------------------------

  if (status === "error") {
    return <FeedError error={error} onRetry={onRetry} />;
  }

  if (status === "loading" && (!items || items.length === 0)) {
    return <FeedLoading setGridEl={setGridEl} />;
  }

  if (status === "success" && items && items.length === 0) {
    return <FeedEmpty hasActiveFilters={hasActiveFilters} />;
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
      onItemClick={onItemClick}
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
