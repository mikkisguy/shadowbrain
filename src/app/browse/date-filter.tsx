"use client";

import { useEffect, useId, useState } from "react";
import { CalendarRange } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import type { BrowseFilters } from "./types";

interface DateFilterProps {
  startDate: string;
  endDate: string;
  onPatch: (patch: Partial<BrowseFilters>) => void;
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

export function DateFilter({
  startDate: propStartDate,
  endDate: propEndDate,
  onPatch,
}: DateFilterProps) {
  const startId = useId();
  const endId = useId();

  // ---- date drafts ------------------------------------------------
  // Custom date inputs keep a local draft so typing doesn't thrash the
  // URL; the draft syncs back from props whenever the filters change
  // externally (Clear, a preset button, back-button navigation).
  const [startDate, setStartDate] = useState(propStartDate);
  const [endDate, setEndDate] = useState(propEndDate);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setStartDate(propStartDate);
  }, [propStartDate]);
  useEffect(() => {
    setEndDate(propEndDate);
  }, [propEndDate]);
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

  // Highlight the preset button whose range is currently applied so the
  // user can see at a glance which quick range (if any) is active.
  const isPreset7dActive =
    propStartDate === daysAgoDate(7) && propEndDate === todayDate();
  const isPreset30dActive =
    propStartDate === daysAgoDate(30) && propEndDate === todayDate();

  return (
    <>
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
    </>
  );
}
