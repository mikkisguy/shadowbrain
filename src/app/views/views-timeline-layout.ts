/**
 * Shared date and lane layout for the Views timeline.
 *
 * The default zoom is month. The week|two_week|month|quarter choice is
 * persisted via TIMELINE_ZOOM_STORAGE_KEY.
 * Prev/Next/Today shift the anchor window.
 * All calendar calculations use the local timezone.
 */

import type { GridRow } from "./types";

export type TimelineZoom = "week" | "two_week" | "month" | "quarter";

export const DEFAULT_TIMELINE_ZOOM: TimelineZoom = "month";
export const TIMELINE_ZOOM_STORAGE_KEY = "views.timeline.zoom";

export function coerceTimelineZoom(value: unknown): TimelineZoom {
  return value === "week" ||
    value === "two_week" ||
    value === "month" ||
    value === "quarter"
    ? value
    : DEFAULT_TIMELINE_ZOOM;
}

export function readStoredTimelineZoom(): TimelineZoom {
  if (typeof window === "undefined") return DEFAULT_TIMELINE_ZOOM;

  try {
    return coerceTimelineZoom(
      window.localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_TIMELINE_ZOOM;
  }
}

export function writeStoredTimelineZoom(zoom: TimelineZoom): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      TIMELINE_ZOOM_STORAGE_KEY,
      coerceTimelineZoom(zoom)
    );
  } catch {
    // Ignore unavailable or quota-exceeded storage.
  }
}

export type TimelineDay = {
  key: string;
  date: Date;
  label: string;
  isToday: boolean;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, amount: number): Date {
  const result = cloneDate(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function localDayOrdinal(date: Date): number {
  // Gregorian day number derived from local calendar fields. This avoids
  // timezone-dependent millisecond differences around daylight-saving days.
  const month = date.getMonth() + 1;
  const adjustment = Math.floor((14 - month) / 12);
  const year = date.getFullYear() + 4800 - adjustment;
  const normalizedMonth = month + 12 * adjustment - 3;
  return (
    date.getDate() +
    Math.floor((153 * normalizedMonth + 2) / 5) +
    365 * year +
    Math.floor(year / 4) -
    Math.floor(year / 100) +
    Math.floor(year / 400) -
    32045
  );
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameLocalDay(left: Date, right: Date): boolean {
  return localDateKey(left) === localDateKey(right);
}

export function parseLocalDateInput(value: string): Date | null {
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(year, month - 1, day);
  return local.getFullYear() === year &&
    local.getMonth() === month - 1 &&
    local.getDate() === day
    ? local
    : null;
}

function parseDateValue(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);

  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const local = new Date(year, month - 1, day);
    if (
      local.getFullYear() !== year ||
      local.getMonth() !== month - 1 ||
      local.getDate() !== day
    ) {
      return null;
    }

    if (text.length === 10) return parseLocalDateInput(text);

    // Timestamp positions use the timestamp's local calendar day, rather
    // than allowing UTC parsing to change the header day.
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
}

function metadataDate(row: GridRow, key: string): Date | null {
  return parseDateValue(row.metadata?.[key]);
}

function spanFromDates(
  start: Date | null,
  end: Date | null
): {
  start: Date;
  end: Date;
} | null {
  if (!start && !end) return null;
  const resolvedStart = start ?? end;
  const resolvedEnd = end ?? start;
  if (!resolvedStart || !resolvedEnd) return null;
  return {
    start: resolvedStart,
    end:
      resolvedEnd.getTime() < resolvedStart.getTime()
        ? resolvedStart
        : resolvedEnd,
  };
}
export function buildTimelineRange(
  anchor: Date,
  zoom: TimelineZoom,
  today: Date = new Date()
): { start: Date; end: Date; days: TimelineDay[] } {
  const safeAnchor = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  const safeZoom = coerceTimelineZoom(zoom);
  const anchorDay = startOfLocalDay(safeAnchor);
  let start: Date;
  let end: Date;
  if (safeZoom === "week" || safeZoom === "two_week") {
    start = addLocalDays(anchorDay, -((anchorDay.getDay() + 6) % 7));
    end = addLocalDays(start, safeZoom === "week" ? 7 : 14);
  } else if (safeZoom === "quarter") {
    const quarterStartMonth = Math.floor(anchorDay.getMonth() / 3) * 3;
    start = new Date(anchorDay.getFullYear(), quarterStartMonth, 1);
    end = new Date(anchorDay.getFullYear(), quarterStartMonth + 3, 1);
  } else {
    start = new Date(anchorDay.getFullYear(), anchorDay.getMonth(), 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }

  const days: TimelineDay[] = [];
  for (let date = cloneDate(start); date < end; date = addLocalDays(date, 1)) {
    days.push({
      key: localDateKey(date),
      date: cloneDate(date),
      label: `${WEEKDAY_LABELS[date.getDay()]} ${date.getDate()}`,
      isToday: sameLocalDay(date, today),
    });
  }

  return { start, end, days };
}

export function shiftTimelineAnchor(
  anchor: Date,
  zoom: TimelineZoom,
  direction: -1 | 1
): Date {
  const safeAnchor = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  const safeZoom = coerceTimelineZoom(zoom);
  if (safeZoom === "week" || safeZoom === "two_week") {
    return addLocalDays(safeAnchor, direction * (safeZoom === "week" ? 7 : 14));
  }

  const result = cloneDate(safeAnchor);
  const day = result.getDate();
  const monthDelta = safeZoom === "quarter" ? direction * 3 : direction;
  const targetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + monthDelta + 1,
    0
  );
  result.setDate(1);
  result.setMonth(result.getMonth() + monthDelta);
  result.setDate(Math.min(day, targetMonth.getDate()));
  return result;
}

export function resolveItemSpan(
  row: GridRow
): { start: Date; end: Date } | null {
  const rowStart = parseDateValue(row.startOrDue);
  const rowEnd = parseDateValue(row.end);

  if (row.type === "event") {
    const start = metadataDate(row, "start_date") ?? rowStart;
    const end = metadataDate(row, "end_date") ?? rowEnd ?? start;
    return spanFromDates(start, end);
  }

  if (row.type === "task") {
    // Task precedence: end metadata/top-level end, metadata start, then
    // due metadata/top-level startOrDue. A due date remains the end bound
    // whenever no explicit end date exists.
    const start = metadataDate(row, "start_date");
    const end = metadataDate(row, "end_date") ?? rowEnd;
    const due = metadataDate(row, "due_date") ?? rowStart;

    if (start && end) return spanFromDates(start, end);
    if (start && due) return spanFromDates(start, due);
    if (due && end) return spanFromDates(due, end);
    if (end) return spanFromDates(end, end);
    if (due) return spanFromDates(due, due);
    if (start) return spanFromDates(start, start);
    return null;
  }

  return null;
}

export type TimelineNestedTask = {
  row: GridRow;
  placement: "bar" | "chip";
  leftPct: number;
  widthPct: number;
};

export type TimelineLane = {
  id: string;
  kind: "event" | "orphan-task";
  row: GridRow;
  /** null when the event/task has no overlap with the visible range (still listed if parent event in range or always for orphans in range) */
  bar: { leftPct: number; widthPct: number } | null;
  nestedTasks: TimelineNestedTask[];
};

export type TimelineModel = {
  lanes: TimelineLane[];
  unscheduled: GridRow[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function spanOverlapsRange(
  span: { start: Date; end: Date },
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const start = localDayOrdinal(span.start);
  const endExclusive = localDayOrdinal(span.end) + 1;
  return (
    start < localDayOrdinal(rangeEnd) &&
    endExclusive > localDayOrdinal(rangeStart)
  );
}

function spanBar(
  span: { start: Date; end: Date },
  rangeStart: Date,
  rangeEnd: Date
): { leftPct: number; widthPct: number } | null {
  const visibleStart = localDayOrdinal(rangeStart);
  const visibleEnd = localDayOrdinal(rangeEnd);
  const spanStart = localDayOrdinal(span.start);
  const spanEndExclusive = localDayOrdinal(span.end) + 1;

  const clippedStart = Math.max(spanStart, visibleStart);
  const clippedEnd = Math.min(spanEndExclusive, visibleEnd);
  if (clippedStart >= clippedEnd) return null;

  const totalDays = Math.max(1, visibleEnd - visibleStart);
  const leftPct = clamp(
    ((clippedStart - visibleStart) / totalDays) * 100,
    0,
    100
  );
  const widthPct = clamp(
    Math.max(0.5, ((clippedEnd - clippedStart) / totalDays) * 100),
    0.5,
    Math.max(0.5, 100 - leftPct)
  );
  return { leftPct, widthPct };
}

function chipPlacement(
  parentBar: { leftPct: number; widthPct: number } | null
): { leftPct: number; widthPct: number } {
  const center = parentBar ? parentBar.leftPct + parentBar.widthPct / 2 : 50;
  return {
    leftPct: clamp(center - 1, 0, 98),
    widthPct: 2,
  };
}
export const TIMELINE_GEOMETRY = {
  parentTopRem: 0.75,
  parentHeightRem: 1.75,
  nestedStartRem: 3.15,
  nestedHeightRem: 1.5,
  nestedGapRem: 0.2,
  bottomPaddingRem: 0.75,
} as const;

export function getTimelineLaneMinHeight(nestedTaskCount: number): number {
  const nestedCount = Math.max(0, nestedTaskCount);
  const parentBottom =
    TIMELINE_GEOMETRY.parentTopRem + TIMELINE_GEOMETRY.parentHeightRem;
  const nestedBottom =
    nestedCount === 0
      ? 0
      : TIMELINE_GEOMETRY.nestedStartRem +
        nestedCount * TIMELINE_GEOMETRY.nestedHeightRem +
        (nestedCount - 1) * TIMELINE_GEOMETRY.nestedGapRem;
  return (
    Math.max(parentBottom, nestedBottom) + TIMELINE_GEOMETRY.bottomPaddingRem
  );
}

export function getTimelineNestedTopRem(index: number): number {
  return (
    TIMELINE_GEOMETRY.nestedStartRem +
    Math.max(0, index) *
      (TIMELINE_GEOMETRY.nestedHeightRem + TIMELINE_GEOMETRY.nestedGapRem)
  );
}

export function buildTimelineModel(
  rows: GridRow[],
  rangeStart: Date,
  rangeEnd: Date
): TimelineModel {
  const events = rows.filter((row) => row.type === "event");
  const tasks = rows.filter((row) => row.type === "task");
  const eventSpans = new Map<string, { start: Date; end: Date }>();
  const unscheduled: GridRow[] = [];

  for (const event of events) {
    const span = resolveItemSpan(event);
    if (span) eventSpans.set(event.id, span);
    else unscheduled.push(event);
  }

  const eventRowsById = new Map(events.map((event) => [event.id, event]));
  const nestedByEvent = new Map<string, TimelineNestedTask[]>();
  const orphanLanes: TimelineLane[] = [];

  for (const task of tasks) {
    const parentEvent =
      task.parent?.type === "event"
        ? (eventRowsById.get(task.parent.id) ?? null)
        : null;
    const parentSpan = parentEvent
      ? (eventSpans.get(parentEvent.id) ?? null)
      : null;
    const taskSpan = resolveItemSpan(task);

    if (parentEvent && parentSpan) {
      const parentBar = spanBar(parentSpan, rangeStart, rangeEnd);
      if (taskSpan && spanOverlapsRange(taskSpan, rangeStart, rangeEnd)) {
        const bar = spanBar(taskSpan, rangeStart, rangeEnd);
        if (bar) {
          // Only nest under a visible parent bar. An in-range child of an
          // off-window event becomes an orphan lane so we never invent a
          // null-bar parent row for the current window.
          if (parentBar) {
            const nested = nestedByEvent.get(parentEvent.id) ?? [];
            nested.push({ row: task, placement: "bar", ...bar });
            nestedByEvent.set(parentEvent.id, nested);
          } else {
            orphanLanes.push({
              id: task.id,
              kind: "orphan-task",
              row: task,
              bar,
              nestedTasks: [],
            });
          }
        }
      } else if (!taskSpan) {
        if (parentBar) {
          const nested = nestedByEvent.get(parentEvent.id) ?? [];
          nested.push({
            row: task,
            placement: "chip",
            ...chipPlacement(parentBar),
          });
          nestedByEvent.set(parentEvent.id, nested);
        } else {
          unscheduled.push(task);
        }
      }
      continue;
    }
    if (parentEvent && !taskSpan) {
      unscheduled.push(task);
      continue;
    }

    if (!taskSpan) {
      unscheduled.push(task);
      continue;
    }

    const bar = spanBar(taskSpan, rangeStart, rangeEnd);
    if (bar) {
      orphanLanes.push({
        id: task.id,
        kind: "orphan-task",
        row: task,
        bar,
        nestedTasks: [],
      });
    }
  }

  const eventLanes: TimelineLane[] = [];
  for (const event of events) {
    const span = eventSpans.get(event.id);
    if (!span) continue;
    const bar = spanBar(span, rangeStart, rangeEnd);
    const nestedTasks = nestedByEvent.get(event.id) ?? [];
    if (!bar && nestedTasks.length === 0) continue;
    eventLanes.push({
      id: event.id,
      kind: "event",
      row: event,
      bar,
      nestedTasks,
    });
  }

  const lanes = [...eventLanes, ...orphanLanes].sort((left, right) => {
    const leftStart = left.bar?.leftPct ?? Number.POSITIVE_INFINITY;
    const rightStart = right.bar?.leftPct ?? Number.POSITIVE_INFINITY;
    if (leftStart !== rightStart) return leftStart - rightStart;
    return (left.row.title ?? "").localeCompare(right.row.title ?? "");
  });

  return { lanes, unscheduled };
}
