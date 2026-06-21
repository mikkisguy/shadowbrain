"use client";

/**
 * Advanced-filters panel.
 *
 * A small, collapsible form that surfaces the secondary filters
 * (tag, source, date range) without taking up real-estate on the
 * default view. The panel is controlled by the parent toolbar —
 * the open/closed state is purely UI and does not travel in the
 * URL, so a refresh always lands on the closed (default) state.
 *
 * Each input is committed to the URL on `change` / `blur` via the
 * parent's `setFilters`. The inputs are uncontrolled except for
 * their initial value, so a typing user does not lose focus on
 * each keystroke.
 */

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { BrowseFilters } from "./types";

export interface AdvancedFiltersProps {
  /** Current filter set, used to seed the inputs. */
  filters: BrowseFilters;
  /** Patch the filter set (one or more keys). */
  onPatch: (patch: Partial<BrowseFilters>) => void;
  /** Reset every filter. */
  onClear: () => void;
}

export function AdvancedFilters({
  filters,
  onPatch,
  onClear,
}: AdvancedFiltersProps) {
  // Each input is a controlled-by-`key` field: the local value is
  // a string the user is typing, and we push it to the URL on
  // `onBlur` (or on `Enter`). This keeps the URL as the source of
  // truth for *applied* filters and avoids a request per keystroke.
  const [tagInput, setTagInput] = useState(filters.tag ?? "");
  const [sourceInput, setSourceInput] = useState(filters.source ?? "");
  const [startDate, setStartDate] = useState(filters.startDate ?? "");
  const [endDate, setEndDate] = useState(filters.endDate ?? "");

  // Stable ids so the label / input pairing is screen-reader-correct
  // even if the panel is re-rendered.
  const tagId = useId();
  const sourceId = useId();
  const startId = useId();
  const endId = useId();

  function commitTag() {
    onPatch({ tag: tagInput });
  }
  function commitSource() {
    onPatch({ source: sourceInput });
  }
  function commitDateRange() {
    onPatch({ startDate, endDate });
  }

  const hasAnyFilter = Boolean(
    filters.tag || filters.source || filters.startDate || filters.endDate
  );

  return (
    <section
      aria-label="Advanced filters"
      data-testid="advanced-filters"
      className={cn(
        "border-border bg-surface-elevated/50 flex flex-col gap-4 rounded-sm border p-4"
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={tagId}
            className="text-muted-foreground font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase"
          >
            Tag
          </label>
          <Input
            id={tagId}
            name="tag"
            placeholder="e.g. docker"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onBlur={commitTag}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTag();
              }
            }}
            data-testid="advanced-tag"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={sourceId}
            className="text-muted-foreground font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase"
          >
            Source
          </label>
          <Input
            id={sourceId}
            name="source"
            placeholder="discord · web · hermes · api · manual"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            onBlur={commitSource}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSource();
              }
            }}
            data-testid="advanced-source"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={startId}
            className="text-muted-foreground font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase"
          >
            From
          </label>
          <Input
            id={startId}
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onBlur={commitDateRange}
            data-testid="advanced-start"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={endId}
            className="text-muted-foreground font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase"
          >
            To
          </label>
          <Input
            id={endId}
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            onBlur={commitDateRange}
            data-testid="advanced-end"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground font-sans text-xs">
          Filters are applied to the feed immediately. The URL always reflects
          the current view.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={!hasAnyFilter}
          data-testid="advanced-clear"
        >
          Clear all
        </Button>
      </div>
    </section>
  );
}
