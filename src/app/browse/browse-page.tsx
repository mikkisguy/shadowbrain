"use client";

/**
 * Browse page — main client component.
 *
 * Orchestrates the toolbar, the feed, and the URL state. The
 * `useBrowseState` hook owns the data-fetch lifecycle; this
 * component just renders the page chrome and wires the toolbar's
 * filter changes to the hook's `setFilters` patcher.
 *
 * The page renders inside the `app/page.tsx` server component,
 * which provides the route shell. This component is purely
 * interactive state.
 */

import { BrowseToolbar } from "./browse-toolbar";
import { ContentFeed } from "./content-feed";
import { useBrowseState } from "./use-browse-state";

export function BrowsePage() {
  const {
    filters,
    data,
    status,
    error,
    isSearchPending,
    setFilters,
    clearFilters,
    retry,
  } = useBrowseState();

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
      <header className="border-border flex flex-col gap-3 border-b pb-6">
        <p className="text-muted-foreground font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          Browse · {data ? data.total : 0} items
        </p>
        <h1 className="text-foreground font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          Your second brain
        </h1>
        <p className="text-muted-foreground max-w-2xl font-sans text-sm leading-relaxed">
          Search by keyword, filter by type, or narrow by tag, source, and date.
          The URL is the source of truth — share a link and the view comes back
          the same.
        </p>
      </header>

      <BrowseToolbar
        filters={filters}
        isSearchPending={isSearchPending}
        isInitialLoading={status === "loading" && !data}
        onFiltersChange={setFilters}
        onClear={clearFilters}
      />

      <ContentFeed
        items={data?.items ?? null}
        status={status}
        error={error}
        onRetry={retry}
        hasActiveFilters={hasActiveFilters}
      />
    </main>
  );
}
