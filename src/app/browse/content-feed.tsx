"use client";

/**
 * Browse feed.
 *
 * Renders the four states the Browse page can be in:
 *   - **loading** (first paint, no data yet) — a neutral skeleton
 *     so the layout reserves space
 *   - **error** — a one-line message and a "Try again" button
 *   - **empty** — a friendly "no results" line tuned to the active
 *     filter set (e.g. "No journal entries match these filters" vs
 *     "Your second brain is empty")
 *   - **success** — the card list
 *
 * The component is purely presentational. The hook above owns the
 * fetch lifecycle and the URL sync; this component is only
 * concerned with the visual states.
 */

import { Button } from "@/components/ui/button";
import { ContentCard } from "./content-card";
import type { BrowseItem } from "./types";

export interface ContentFeedProps {
  items: BrowseItem[] | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  onRetry: () => void;
  /** Whether the active filter set is non-empty. Drives the
   *  empty-state copy. */
  hasActiveFilters: boolean;
}

const SKELETON_CARD_COUNT = 4;

export function ContentFeed({
  items,
  status,
  error,
  onRetry,
  hasActiveFilters,
}: ContentFeedProps) {
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
        className="grid gap-3"
      >
        {Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
          <div
            key={i}
            className="border-border bg-surface-elevated flex flex-col gap-3 rounded-sm border p-4"
          >
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
    // Idle state — we have not fetched yet, but the parent is
    // showing a loading skeleton elsewhere. Render nothing so
    // the toolbar still takes focus.
    return null;
  }

  return (
    <ul data-testid="feed" aria-label="Browse feed" className="grid gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <ContentCard item={item} />
        </li>
      ))}
    </ul>
  );
}
