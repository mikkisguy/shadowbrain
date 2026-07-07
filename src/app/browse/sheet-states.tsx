"use client";

export function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="sheet-loading">
      {/* Image placeholder */}
      <div className="bg-surface-muted h-40 w-full animate-pulse rounded-sm" />
      {/* Badge + title */}
      <div className="flex flex-col gap-3">
        <div className="bg-surface-muted h-5 w-16 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-8 w-3/4 animate-pulse rounded-sm" />
      </div>
      {/* Date/source row */}
      <div className="flex gap-4">
        <div className="bg-surface-muted h-4 w-24 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-28 animate-pulse rounded-sm" />
      </div>
      {/* Content paragraphs */}
      <div className="flex flex-col gap-2">
        <div className="bg-surface-muted h-4 w-full animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-5/6 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-4/6 animate-pulse rounded-sm" />
        <div className="bg-surface-muted h-4 w-full animate-pulse rounded-sm" />
      </div>
    </div>
  );
}

export function SheetError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-start gap-3 p-6"
      data-testid="sheet-error"
    >
      <p className="text-error font-sans text-sm font-medium">
        Couldn&apos;t load this item right now.
      </p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="sheet-retry"
        className="text-primary font-sans text-sm hover:underline"
      >
        Try again
      </button>
    </div>
  );
}
