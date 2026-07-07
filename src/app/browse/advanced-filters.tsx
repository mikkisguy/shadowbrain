"use client";

/**
 * Advanced-filters panel.
 *
 * Surfaces the secondary filters (tag, source, date range) in a form
 * that the parent toolbar toggles open/closed. The open/closed state
 * is UI-only (owned by the toolbar, persisted to `sessionStorage`
 * there); this component is a pure view of the parent's filter set.
 *
 * Each control commits to the URL on change via the parent's
 * `onPatch`.
 *
 * Tag and date-range sub-components live in their own files.
 */

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { splitTags } from "@/lib/tags";

import { TagFilter } from "./tag-filter";
import { DateFilter } from "./date-filter";

import type { BrowseFilters } from "./types";

export interface AdvancedFiltersProps {
  /** Current filter set, used to seed the inputs. */
  filters: BrowseFilters;
  /** Patch the filter set (one or more keys). */
  onPatch: (patch: Partial<BrowseFilters>) => void;
  /** Reset every filter. */
  onClear: () => void;
}

// ---- source options ----------------------------------------------

/** The fixed source values that can appear on `content_items.source`.
 *  Matches the ingestion sources plus `manual` for items created in
 *  the UI. */
const SOURCE_OPTIONS = ["discord", "web", "hermes", "api", "manual"] as const;

// ---- component ----------------------------------------------------

export function AdvancedFilters({
  filters,
  onPatch,
  onClear,
}: AdvancedFiltersProps) {
  const selectedTags = splitTags(filters.tag ?? "");

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
      <TagFilter selectedTags={selectedTags} onPatch={onPatch} />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ---- Source dropdown ---- */}
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase">
            Source
          </span>
          <Select
            value={filters.source ?? null}
            onValueChange={(v) =>
              onPatch({
                source: typeof v === "string" && v !== "" ? v : undefined,
              })
            }
          >
            <SelectTrigger
              data-testid="advanced-source"
              aria-label="Filter by source"
            >
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All sources</SelectItem>
              {SOURCE_OPTIONS.map((src) => (
                <SelectItem key={src} value={src}>
                  {src}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DateFilter
          startDate={filters.startDate ?? ""}
          endDate={filters.endDate ?? ""}
          onPatch={onPatch}
        />
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
