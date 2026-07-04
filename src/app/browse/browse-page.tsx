"use client";

/**
 * Browse page — main client component.
 *
 * Orchestrates the toolbar, the feed, and the URL state. The
 * `useBrowseState` hook owns the data-fetch lifecycle and the
 * accumulated items; this component renders the page chrome and
 * wires the toolbar's filter changes to the hook's `setFilters`
 * patcher.
 *
 * Two display preferences live in `useState` (not the URL):
 *   - **view** — grid (multi-column masonry) vs list
 *     (single-column wide row).
 *   - **cardVariant** — the per-card type-indicator treatment:
 *     a slightly chunkier dot, or a filled coloured pill.
 *
 * Both have segmented controls just above the feed. The defaults
 * are `view="grid"` and `cardVariant="larger-dot"`.
 */

import { LayoutGrid, Rows3 } from "lucide-react";
import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CelestialHeader } from "@/components/visual/celestial-motif";
import { BrowseToolbar } from "./browse-toolbar";
import { ContentFeed } from "./content-feed";
import { useBrowseState } from "./use-browse-state";
import { ItemPreviewSheet } from "./item-preview-sheet";
import type { BrowseView } from "./types";

export function BrowsePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    filters,
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
  } = useBrowseState();

  const [view, setView] = useState<BrowseView>("grid");
  const [cardVariant, setCardVariant] = useState<"pill" | "larger-dot">(
    "larger-dot"
  );

  // Item preview sheet: read `?item=` from the URL so the state is
  // shareable / deep-linkable. The sheet is dismissed by removing the
  // param from the URL, which is handled by `handleClosePreview`.
  const previewItemId = searchParams.get("item");
  const searchString = searchParams.toString();

  const handleClosePreview = useCallback(() => {
    const params = new URLSearchParams(searchString);
    params.delete("item");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchString]);

  const handleItemClick = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchString);
      params.set("item", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchString]
  );

  const hasActiveFilters = Boolean(
    filters.q ||
    filters.type ||
    filters.tag ||
    filters.source ||
    filters.startDate ||
    filters.endDate
  );

  return (
    <main
      id="main-content"
      data-testid="browse-page"
      className="mx-auto flex w-full max-w-screen-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="relative flex flex-col gap-3 overflow-hidden pb-2">
        {/*
          A restrained "title plate" — the celestial engraving confined
          to the header band so it frames the title without reaching the
          toolbar or the feed. On this surface content is the hero, so
          the art lives only in this negative space above it. The title
          text is lifted to z-10 so it reads above the (very faint)
          line-work.
        */}
        <CelestialHeader headerShift={-15} />
        <p className="text-muted-foreground relative z-10 font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          {total} items
        </p>
        <h1 className="text-foreground relative z-10 font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          Browse your second brain
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        <BrowseToolbar
          filters={filters}
          isSearchPending={isSearchPending}
          isInitialLoading={status === "loading" && items.length === 0}
          onFiltersChange={setFilters}
          onClear={clearFilters}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Indicator toggle: chip / dot. The default is the
              larger dot (gentler), the pill is the bolder option
              for users who want the type to be the first thing
              the eye lands on. */}
          <div
            role="group"
            aria-label="Card type indicator"
            className="border-border bg-surface-elevated/50 inline-flex items-center gap-0.5 rounded-sm border p-0.5"
            data-testid="indicator-toggle"
          >
            <Button
              type="button"
              variant={cardVariant === "larger-dot" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={cardVariant === "larger-dot"}
              data-testid="indicator-dot"
              onClick={() => setCardVariant("larger-dot")}
            >
              Dot
            </Button>
            <Button
              type="button"
              variant={cardVariant === "pill" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={cardVariant === "pill"}
              data-testid="indicator-pill"
              onClick={() => setCardVariant("pill")}
            >
              Pill
            </Button>
          </div>

          {/* View toggle: grid / list. */}
          <div
            role="group"
            aria-label="Feed view"
            className="border-border bg-surface-elevated/50 inline-flex items-center gap-0.5 rounded-sm border p-0.5"
            data-testid="view-toggle"
          >
            <Button
              type="button"
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              data-testid="view-grid"
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-pressed={view === "list"}
              aria-label="List view"
              data-testid="view-list"
              onClick={() => setView("list")}
            >
              <Rows3 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <ContentFeed
        items={items}
        status={status}
        error={error}
        onRetry={retry}
        hasActiveFilters={hasActiveFilters}
        view={view}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        cardVariant={cardVariant}
        // Issue #24: while a search query is active, the feed shows
        // search results as a finite set — the scroll-triggered
        // auto-load is suspended (a manual "Load more" still
        // paginates). Clearing `q` re-enables infinite scroll.
        infiniteScroll={!filters.q}
        // Clicking a card's tag pill narrows the feed to that tag.
        // `setFilters({ tag })` updates the URL (`?tag=…`) and resets
        // to page 1, exactly like picking the tag from the advanced
        // filters panel. The card's own navigation (click-anywhere →
        // /item/[id]) is handled inside the card via a stretched link.
        onTagClick={(tag) => setFilters({ tag })}
        // Regular left-click on a card opens the item preview sheet.
        // Ctrl/Cmd+Click and middle-click pass through to the native
        // <Link> behaviour (open in new tab).
        onItemClick={handleItemClick}
      />

      <ItemPreviewSheet itemId={previewItemId} onClose={handleClosePreview} />
    </main>
  );
}
