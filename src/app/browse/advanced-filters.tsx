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
 * `onPatch`. The inputs that tolerate rapid typing (tag typeahead,
 * custom dates) keep a local draft so a typing user does not thrash
 * the URL on every keystroke.
 *
 * Tag multi-select: the `tag` filter is a comma-separated string in
 * the URL (`?tag=docker,kubernetes`). The component splits it into
 * chips and supports add (type + Enter / click a suggestion) and
 * remove (chip ×). Suggestions come from `/api/tags` (fetched lazily
 * on first focus) so the user can discover existing tags.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarRange, Tag as TagIcon, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
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
import { queryKeys, staleTimes } from "@/lib/query-config";

import type { BrowseFilters } from "./types";

export interface AdvancedFiltersProps {
  /** Current filter set, used to seed the inputs. */
  filters: BrowseFilters;
  /** Patch the filter set (one or more keys). */
  onPatch: (patch: Partial<BrowseFilters>) => void;
  /** Reset every filter. */
  onClear: () => void;
}

// ---- date helpers -------------------------------------------------

/** Format a `Date` as a `YYYY-MM-DD` string suitable for an
 *  `<input type="date">` value and the API's `startDate` / `endDate`
 *  params (which compare against ISO `created_at` prefixes). */
function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date as `YYYY-MM-DD` (UTC, matching `created_at` storage). */
function todayDate(): string {
  return toDateInput(new Date());
}

/** The date `n` days ago as `YYYY-MM-DD`. */
function daysAgoDate(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return toDateInput(d);
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

  // Stable ids for label / input pairing.
  const tagId = useId();
  const startId = useId();
  const endId = useId();

  // ---- tag typeahead ---------------------------------------------
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Fetch tags for typeahead suggestions. Enabled on first focus.
  const [tagsEnabled, setTagsEnabled] = useState(false);
  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.typeahead,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/tags", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { tags: { name: string }[] };
      return body.tags;
    },
    enabled: tagsEnabled,
    staleTime: staleTimes.tags,
  });

  const allTagNames = useMemo(() => {
    if (!tagsData) return null;
    return tagsData.map((t) => t.name);
  }, [tagsData]);

  const suggestions = useMemo(() => {
    if (!allTagNames) return [];
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(selectedTags.map((t) => t.toLowerCase()));
    return allTagNames
      .filter(
        (name) =>
          name.toLowerCase().includes(q) && !taken.has(name.toLowerCase())
      )
      .slice(0, 8);
  }, [allTagNames, tagInput, selectedTags]);

  function addTag(raw: string) {
    const name = raw.trim();
    if (!name) return;
    // Dedupe case-insensitively (the DB matches tags COLLATE NOCASE).
    if (selectedTags.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setTagInput("");
      return;
    }
    onPatch({ tag: [...selectedTags, name].join(",") });
    setTagInput("");
  }

  function removeTag(name: string) {
    const next = selectedTags.filter((t) => t !== name);
    onPatch({ tag: next.length > 0 ? next.join(",") : undefined });
  }

  // ---- date drafts ------------------------------------------------
  // Custom date inputs keep a local draft so typing doesn't thrash the
  // URL; the draft syncs back from `filters` whenever the filters
  // change externally (Clear, a preset button, back-button navigation).
  const [startDate, setStartDate] = useState(filters.startDate ?? "");
  const [endDate, setEndDate] = useState(filters.endDate ?? "");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setStartDate(filters.startDate ?? "");
  }, [filters.startDate]);
  useEffect(() => {
    setEndDate(filters.endDate ?? "");
  }, [filters.endDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function commitDateRange() {
    onPatch({ startDate, endDate });
  }

  function applyPreset(days: number) {
    const start = daysAgoDate(days);
    const end = todayDate();
    setStartDate(start);
    setEndDate(end);
    onPatch({ startDate: start, endDate: end });
  }

  const hasAnyFilter = Boolean(
    filters.tag || filters.source || filters.startDate || filters.endDate
  );

  // Highlight the preset button whose range is currently applied so the
  // user can see at a glance which quick range (if any) is active.
  const isPreset7dActive =
    filters.startDate === daysAgoDate(7) && filters.endDate === todayDate();
  const isPreset30dActive =
    filters.startDate === daysAgoDate(30) && filters.endDate === todayDate();

  return (
    <section
      aria-label="Advanced filters"
      data-testid="advanced-filters"
      className={cn(
        "border-border bg-surface-elevated/50 flex flex-col gap-4 rounded-sm border p-4"
      )}
    >
      {/* ---- Tag multi-select ---- */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={tagId}
          className="text-muted-foreground flex items-center gap-1.5 font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase"
        >
          <TagIcon className="size-3" />
          Tags
        </label>
        <div
          className="border-input focus-within:border-ring focus-within:ring-ring/50 flex flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1 transition-colors focus-within:ring-3"
          data-testid="tag-chips"
        >
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => removeTag(tag)}
                className="hover:text-foreground -mr-0.5 inline-flex size-3.5 items-center justify-center transition-colors"
                data-testid={`tag-remove-${tag}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={tagInputRef}
            id={tagId}
            className="text-foreground placeholder:text-muted-foreground min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
            placeholder={
              selectedTags.length > 0 ? "Add tag…" : "Type to search tags…"
            }
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onFocus={() => setTagsEnabled(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagInput);
              } else if (
                e.key === "Backspace" &&
                tagInput === "" &&
                selectedTags.length > 0
              ) {
                // Backspace on an empty input removes the last chip.
                removeTag(selectedTags[selectedTags.length - 1]);
              }
            }}
            data-testid="advanced-tag"
          />
        </div>
        {suggestions.length > 0 ? (
          <ul
            className="bg-popover text-popover-foreground border-border z-10 flex flex-col overflow-hidden rounded-md border"
            data-testid="tag-suggestions"
          >
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className="hover:bg-muted hover:text-foreground w-full px-2.5 py-1 text-left text-sm transition-colors"
                  onClick={() => {
                    addTag(name);
                    tagInputRef.current?.focus();
                  }}
                  data-testid={`tag-suggestion-${name}`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

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

        {/* ---- Date presets ---- */}
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground flex items-center gap-1.5 font-sans text-[0.7rem] font-medium tracking-[0.12em] uppercase">
            <CalendarRange className="size-3" />
            Quick range
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant={isPreset7dActive ? "secondary" : "ghost"}
              size="sm"
              onClick={() => applyPreset(7)}
              data-testid="preset-7d"
            >
              Last 7 days
            </Button>
            <Button
              type="button"
              variant={isPreset30dActive ? "secondary" : "ghost"}
              size="sm"
              onClick={() => applyPreset(30)}
              data-testid="preset-30d"
            >
              Last 30 days
            </Button>
          </div>
        </div>

        {/* ---- Custom date range ---- */}
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
