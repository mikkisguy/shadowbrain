"use client";

import { Button } from "@/components/ui/button";

export function ViewsGridLoading({ noun = "grid" }: { noun?: string } = {}) {
  return (
    <div
      data-testid="views-grid-loading"
      role="status"
      aria-label={`Loading ${noun}`}
      className="border-border overflow-hidden rounded-sm border"
    >
      <div className="bg-surface-muted h-9 border-b" />
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="border-border bg-surface-elevated flex h-10 items-center gap-3 border-b px-3 last:border-b-0"
        >
          <div className="bg-surface-muted h-3 w-12 rounded-sm" />
          <div className="bg-surface-muted h-3 w-32 rounded-sm" />
          <div className="bg-surface-muted h-3 w-20 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export function ViewsGridError({
  error,
  onRetry,
  noun = "grid",
}: {
  error: string | null;
  onRetry: () => void;
  noun?: string;
}) {
  return (
    <div
      data-testid="views-grid-error"
      className="border-border bg-surface-elevated flex flex-col items-start gap-3 rounded-sm border p-6"
    >
      <p className="text-error font-sans text-sm font-medium">
        {error ?? `Couldn't load the ${noun} right now.`}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function ViewsGridEmpty({
  scoped,
  noun = "grid",
}: {
  scoped: boolean;
  noun?: string;
}) {
  return (
    <div
      data-testid="views-grid-empty"
      className="border-border bg-surface-elevated/40 rounded-sm border border-dashed p-8 text-center"
    >
      <p className="text-foreground font-sans text-base font-medium">
        {scoped
          ? "No events or tasks in this project"
          : "No events or tasks yet"}
      </p>
      <p className="text-muted-foreground mt-1 font-sans text-sm">
        {scoped
          ? "Link events and tasks to this project to see them here."
          : `Create an event or task to populate the ${noun}.`}
      </p>
    </div>
  );
}
