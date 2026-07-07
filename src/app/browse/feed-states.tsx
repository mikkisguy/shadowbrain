"use client";

import { Button } from "@/components/ui/button";
import { CelestialCluster } from "@/components/visual/celestial-motif";

const SKELETON_CARD_COUNT = 6;

export function FeedError({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
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

export function FeedLoading({
  setGridEl,
}: {
  setGridEl: (el: HTMLDivElement | null) => void;
}) {
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

export function FeedEmpty({ hasActiveFilters }: { hasActiveFilters: boolean }) {
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
