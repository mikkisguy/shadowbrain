"use client";

/**
 * Browse-page toolbar.
 *
 * Three regions in a vertical stack:
 *   1. **Search input** — debounced, mirrors the URL `?q=`. The
 *      input's local value is owned by the toolbar; the committed
 *      value is owned by the hook. Pressing Enter (or the field
 *      losing focus after 300ms of inactivity, per the hook's
 *      debounce) pushes the change into the URL.
 *   2. **Type tabs** — the five-tab strip with the type-coloured
 *      dots.
 *   3. **Advanced filters toggle** — a small button that expands
 *      the advanced-filters panel. Collapsed by default per the
 *      issue's acceptance criteria.
 *
 * The toolbar does not own the filter set — every change goes
 * through the parent via `onFiltersChange`. The toolbar is a pure
 * view of the parent's state plus a few local input drafts.
 */

import { useEffect, useId, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { AdvancedFilters } from "./advanced-filters";
import { TypeTabs, apiValueForTab } from "./type-tabs";
import { type BrowseFilters, type BrowseTypeTab, coerceTypeTab } from "./types";

export interface BrowseToolbarProps {
  filters: BrowseFilters;
  /** True while the search input's debounce timer is still
   *  pending. Drives the small "pending" indicator. */
  isSearchPending: boolean;
  /** True while the first request is in flight. Disables the
   *  type tabs so the user does not get into a state where the
   *  active tab and the data do not agree. */
  isInitialLoading: boolean;
  onFiltersChange: (patch: Partial<BrowseFilters>) => void;
  onClear: () => void;
}

export function BrowseToolbar({
  filters,
  isSearchPending,
  isInitialLoading,
  onFiltersChange,
  onClear,
}: BrowseToolbarProps) {
  const searchId = useId();
  const activeTab = coerceTypeTab(filters.type);

  // Local draft for the search input. The hook owns the
  // committed value; we mirror `filters.q` into local state on
  // mount and on every URL change so the back button / refresh
  // correctly repopulates the field.
  /* eslint-disable react-hooks/set-state-in-effect */
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");

  useEffect(() => {
    setSearchDraft(filters.q ?? "");
  }, [filters.q]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [advancedOpen, setAdvancedOpen] = useState(false);

  // The "Advanced" button is the only persistent visible cue
  // that secondary filters are available. We also reflect a
  // small "(active)" hint when at least one secondary filter is
  // on, so the user can collapse the panel without losing track
  // of what's applied.
  const advancedActive = Boolean(
    filters.tag || filters.source || filters.startDate || filters.endDate
  );

  return (
    <section
      aria-label="Browse filters"
      data-testid="browse-toolbar"
      className="flex flex-col gap-4"
    >
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search your second brain
        </label>
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          id={searchId}
          name="q"
          type="search"
          autoComplete="off"
          placeholder="Search by keyword…"
          value={searchDraft}
          onChange={(e) => {
            const next = e.target.value;
            setSearchDraft(next);
            onFiltersChange({ q: next });
          }}
          data-testid="search-input"
          className="h-10 pr-9 pl-9 text-sm"
        />
        {searchDraft ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setSearchDraft("");
              onFiltersChange({ q: "" });
            }}
            className={cn(
              "text-muted-foreground hover:text-foreground absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
            )}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        <span
          aria-live="polite"
          className="sr-only"
          data-testid="search-pending"
          data-pending={isSearchPending ? "true" : "false"}
        >
          {isSearchPending ? "Updating search…" : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypeTabs
          active={activeTab}
          disabled={isInitialLoading}
          onChange={(tab: BrowseTypeTab) =>
            onFiltersChange({ type: apiValueForTab(tab) })
          }
        />
        <Button
          type="button"
          variant={advancedOpen ? "secondary" : "ghost"}
          size="sm"
          aria-expanded={advancedOpen}
          aria-controls="advanced-filters-panel"
          onClick={() => setAdvancedOpen((v) => !v)}
          data-testid="advanced-toggle"
        >
          <SlidersHorizontal className="size-3.5" />
          <span>Advanced</span>
          {advancedActive ? (
            <span aria-hidden className="bg-primary size-1.5 rounded-full" />
          ) : null}
        </Button>
      </div>

      {advancedOpen ? (
        <div id="advanced-filters-panel">
          <AdvancedFilters
            filters={filters}
            onPatch={onFiltersChange}
            onClear={onClear}
          />
        </div>
      ) : null}
    </section>
  );
}
