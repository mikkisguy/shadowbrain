"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { ContentTypeLabel } from "@/components/content-type-label";
import { Button } from "@/components/ui/button";
import { typeColorClass, typeLabel } from "@/lib/content-types";
import { cn } from "@/lib/utils";

import type { GridRow } from "./types";
import { useViewsGridData } from "./use-views-grid-data";
import {
  buildTimelineModel,
  buildTimelineRange,
  DEFAULT_TIMELINE_ZOOM,
  getTimelineLaneMinHeight,
  getTimelineNestedTopRem,
  readStoredTimelineZoom,
  resolveItemSpan,
  shiftTimelineAnchor,
  TIMELINE_GEOMETRY,
  type TimelineDay,
  type TimelineLane,
  type TimelineZoom,
  writeStoredTimelineZoom,
} from "./views-timeline-layout";
import {
  ViewsGridEmpty,
  ViewsGridError,
  ViewsGridLoading,
} from "./views-states";

export interface ViewsTimelineProps {
  projectId: string | null;
  onItemOpen: (id: string) => void;
  includeHidden?: boolean;
  includePrivate?: boolean;
}

const RAIL_WIDTH = "14rem";
const DAY_WIDTH = "7rem";

function rowTitle(row: GridRow): string {
  return row.title?.trim() || "Untitled";
}

function formatRangeLabel(start: Date, end: Date, zoom: TimelineZoom): string {
  if (zoom === "month") {
    return start.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }

  const lastDay = new Date(end.getTime());
  lastDay.setDate(lastDay.getDate() - 1);
  const formatDay = (date: Date) =>
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  return `${formatDay(start)} – ${formatDay(lastDay)}`;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parentContextTitle(row: GridRow, parentTitle?: string): string | null {
  const explicit = parentTitle?.trim();
  if (explicit) return explicit;
  const linked = row.parent?.title?.trim();
  return linked || null;
}

function itemAccessibleName(row: GridRow, parentTitle?: string): string {
  const title = rowTitle(row);
  const span = resolveItemSpan(row);
  const dateLabel = span
    ? span.start.getTime() === span.end.getTime()
      ? ` on ${localDateKey(span.start)}`
      : ` from ${localDateKey(span.start)} through ${localDateKey(span.end)}`
    : "";
  const linkedParent = parentContextTitle(row, parentTitle);
  const parentLabel = linkedParent ? ` under ${linkedParent}` : "";
  return `Open ${typeLabel(row.type)} ${title}${parentLabel}${dateLabel}`;
}
/** Center `dayOffsetLeft` in the scroller and clamp to the scrollable range. */
export function computeCenteredScrollLeft(
  container: Pick<HTMLElement, "clientWidth" | "scrollWidth">,
  dayOffsetLeft: number,
  dayOffsetWidth: number
): number {
  const target = dayOffsetLeft - (container.clientWidth - dayOffsetWidth) / 2;
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  return Math.min(maxScroll, Math.max(0, target));
}

/**
 * Resolve `element.offsetLeft` relative to `container`'s content origin.
 * Walks the offsetParent chain while it stays inside the scroller; falls
 * back to content-relative rect math when offsetParent jumps outside.
 */
export function offsetLeftWithin(
  container: HTMLElement,
  element: HTMLElement
): number {
  let left = 0;
  let node: HTMLElement | null = element;

  while (node && node !== container) {
    left += node.offsetLeft;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent || parent === container) break;
    if (!container.contains(parent)) {
      return (
        element.getBoundingClientRect().left -
        container.getBoundingClientRect().left +
        container.scrollLeft
      );
    }
    node = parent;
  }

  return left;
}

/** Scroll the timeline board so today's day column is centered. */
export function scrollTodayIntoView(
  container: HTMLElement | null,
  todayKey: string
): void {
  if (!container) return;
  const day = container.querySelector<HTMLElement>(
    `[data-timeline-day="${todayKey}"]`
  );
  if (!day) return;

  container.scrollLeft = computeCenteredScrollLeft(
    container,
    offsetLeftWithin(container, day),
    day.offsetWidth
  );
}

function dayHeader(day: TimelineDay) {
  return (
    <div
      key={day.key}
      data-timeline-day={day.key}
      className={cn(
        "border-border flex min-w-28 flex-col justify-center border-l px-3 py-2",
        day.isToday && "bg-accent-cyan/10"
      )}
    >
      <time
        dateTime={day.key}
        className={cn(
          "font-mono text-[0.65rem] tracking-[0.12em] uppercase",
          day.isToday ? "text-accent-cyan" : "text-muted-foreground"
        )}
      >
        {day.isToday ? `${day.label} · Today` : day.label}
      </time>
    </div>
  );
}

function TimelineItemButton({
  row,
  onOpen,
  className,
  style,
  parentTitle,
  children,
}: {
  row: GridRow;
  onOpen: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  parentTitle?: string;
  children?: ReactNode;
}) {
  const title = rowTitle(row);
  return (
    <button
      type="button"
      aria-label={itemAccessibleName(row, parentTitle)}
      className={cn(
        "border-border bg-surface-muted text-foreground focus-visible:ring-ring absolute z-10 overflow-hidden rounded-sm border px-2 pl-3 text-left font-sans text-xs font-medium shadow-sm transition-[filter,transform] hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none",
        className
      )}
      style={style}
      onClick={() => onOpen(row.id)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          typeColorClass(row.type)
        )}
      />
      <span className="block truncate">{children ?? title}</span>
    </button>
  );
}

function LaneLabel({
  lane,
  onOpen,
}: {
  lane: TimelineLane;
  onOpen: (id: string) => void;
}) {
  const title = rowTitle(lane.row);
  const parentTitle = parentContextTitle(lane.row);
  const laneAccessibleName = parentTitle
    ? `Open ${typeLabel(lane.row.type)} lane ${title} under ${parentTitle}`
    : `Open ${typeLabel(lane.row.type)} lane ${title}`;
  return (
    <div className="border-border bg-surface-elevated flex min-w-0 items-start border-b px-3 py-3">
      <button
        type="button"
        aria-label={laneAccessibleName}
        className="text-foreground focus-visible:ring-ring min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
        onClick={() => onOpen(lane.row.id)}
      >
        <ContentTypeLabel
          type={lane.row.type}
          className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.1em] uppercase"
        />
        <span className="mt-1 block truncate font-sans text-sm font-medium">
          {title}
        </span>
        {parentTitle ? (
          <span className="text-muted-foreground mt-0.5 block truncate font-mono text-[0.65rem] tracking-[0.08em]">
            under {parentTitle}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function TimelineLaneRow({
  lane,
  onOpen,
  dayCount,
}: {
  lane: TimelineLane;
  onOpen: (id: string) => void;
  dayCount: number;
}) {
  const rowHeight = getTimelineLaneMinHeight(lane.nestedTasks.length);
  const title = rowTitle(lane.row);

  return (
    <div
      data-testid={`views-timeline-lane-${lane.id}`}
      className="border-border grid border-b"
      style={{
        // Match header day tracks exactly so percent-based bars line up.
        gridTemplateColumns: `${RAIL_WIDTH} repeat(${dayCount}, ${DAY_WIDTH})`,
        minHeight: `${rowHeight}rem`,
      }}
    >
      <LaneLabel lane={lane} onOpen={onOpen} />
      <div
        className="bg-surface-elevated relative min-w-0 border-b"
        style={{ gridColumn: "2 / -1" }}
      >
        {lane.bar && (
          <TimelineItemButton
            row={lane.row}
            onOpen={onOpen}
            className="top-0 h-auto"
            style={{
              top: `${TIMELINE_GEOMETRY.parentTopRem}rem`,
              height: `${TIMELINE_GEOMETRY.parentHeightRem}rem`,
              left: `${lane.bar.leftPct}%`,
              width: `${lane.bar.widthPct}%`,
            }}
          >
            {title}
          </TimelineItemButton>
        )}
        {lane.nestedTasks.map((nested, index) => {
          const taskTitle = rowTitle(nested.row);
          const isBar = nested.placement === "bar";
          return (
            <TimelineItemButton
              key={nested.row.id}
              row={nested.row}
              onOpen={onOpen}
              className={cn(!isBar && "border-dashed")}
              parentTitle={title}
              style={{
                left: `${nested.leftPct}%`,
                width: isBar ? `${nested.widthPct}%` : "2rem",
                top: `${getTimelineNestedTopRem(index)}rem`,
                height: `${TIMELINE_GEOMETRY.nestedHeightRem}rem`,
              }}
            >
              {isBar ? taskTitle : `${taskTitle} · task`}
            </TimelineItemButton>
          );
        })}
      </div>
    </div>
  );
}

function Unscheduled({
  rows,
  onOpen,
}: {
  rows: GridRow[];
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section
      data-testid="views-timeline-unscheduled"
      className="border-border bg-surface-elevated rounded-sm border"
    >
      <header className="border-border flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-foreground font-sans text-sm font-medium">
          Unscheduled
        </h2>
        <span className="text-muted-foreground font-mono text-xs">
          {rows.length}
        </span>
      </header>
      <div className="flex flex-wrap gap-2 p-3">
        {rows.map((row) => {
          const title = rowTitle(row);
          const parentTitle = parentContextTitle(row);
          return (
            <button
              key={row.id}
              type="button"
              aria-label={itemAccessibleName(row)}
              className="border-border bg-surface-muted text-foreground focus-visible:ring-ring hover:bg-muted inline-flex min-h-8 max-w-full items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left font-sans text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => onOpen(row.id)}
            >
              <ContentTypeLabel type={row.type} />
              <span className="min-w-0">
                <span className="block max-w-56 truncate">{title}</span>
                {parentTitle ? (
                  <span className="text-muted-foreground block max-w-56 truncate font-mono text-[0.65rem] tracking-[0.08em]">
                    under {parentTitle}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ViewsTimeline({
  projectId,
  onItemOpen,
  includeHidden = false,
  includePrivate = false,
}: ViewsTimelineProps) {
  const { data, isPending, isError, error, refetch } = useViewsGridData(
    projectId,
    { includeHidden, includePrivate }
  );
  const [anchor, setAnchor] = useState<Date>(() => new Date(0));
  const [zoom, setZoom] = useState<TimelineZoom>(DEFAULT_TIMELINE_ZOOM);
  const [calendarReady, setCalendarReady] = useState(false);
  const [todayScrollRequest, setTodayScrollRequest] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => data ?? [], [data]);
  const range = useMemo(
    () => buildTimelineRange(anchor, zoom, calendarReady ? new Date() : anchor),
    [anchor, calendarReady, zoom]
  );
  const todayKey = calendarReady ? localDateKey(new Date()) : "";
  const model = useMemo(
    () => buildTimelineModel(rows, range.start, range.end),
    [range.end, range.start, rows]
  );

  useEffect(() => {
    queueMicrotask(() => {
      setZoom(readStoredTimelineZoom());
      setAnchor(new Date());
      setCalendarReady(true);
    });
  }, []);
  useEffect(() => {
    if (rows.length === 0 || !range.days.some((day) => day.key === todayKey)) {
      return;
    }

    let cancelled = false;
    const scroll = () => {
      if (!cancelled) scrollTodayIntoView(timelineRef.current, todayKey);
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      const frame = window.requestAnimationFrame(scroll);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
      };
    }

    queueMicrotask(scroll);
    return () => {
      cancelled = true;
    };
  }, [range, rows.length, todayKey, todayScrollRequest]);

  function shiftAnchor(direction: -1 | 1) {
    setAnchor((current) => shiftTimelineAnchor(current, zoom, direction));
  }

  function setTimelineZoom(nextZoom: TimelineZoom) {
    setZoom(nextZoom);
    writeStoredTimelineZoom(nextZoom);
  }

  function goToToday() {
    setAnchor(new Date());
    setTodayScrollRequest((request) => request + 1);
  }

  if (isPending) return <ViewsGridLoading noun="timeline" />;
  if (isError) {
    return (
      <ViewsGridError
        error={error instanceof Error ? error.message : null}
        onRetry={() => void refetch()}
        noun="timeline"
      />
    );
  }
  if (!calendarReady) return <ViewsGridLoading noun="timeline" />;
  if (rows.length === 0) {
    return <ViewsGridEmpty scoped={!!projectId} noun="timeline" />;
  }

  return (
    <div data-testid="views-timeline" className="flex min-w-0 flex-col gap-4">
      <header className="border-border bg-surface-elevated flex flex-wrap items-center justify-between gap-3 rounded-sm border p-3">
        <div>
          <h2 className="text-foreground font-sans text-base font-medium">
            Timeline
          </h2>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {formatRangeLabel(range.start, range.end, zoom)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="views-timeline-prev"
              aria-label="Previous timeline window"
              onClick={() => shiftAnchor(-1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="views-timeline-today"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="views-timeline-next"
              aria-label="Next timeline window"
              onClick={() => shiftAnchor(1)}
            >
              Next
            </Button>
          </div>
          <div
            className="border-border flex rounded-sm border p-0.5"
            role="group"
            aria-label="Timeline zoom"
          >
            <Button
              type="button"
              variant={zoom === "week" ? "secondary" : "ghost"}
              size="sm"
              data-testid="views-timeline-zoom-week"
              aria-pressed={zoom === "week"}
              onClick={() => setTimelineZoom("week")}
            >
              Week
            </Button>
            <Button
              type="button"
              variant={zoom === "month" ? "secondary" : "ghost"}
              size="sm"
              data-testid="views-timeline-zoom-month"
              aria-pressed={zoom === "month"}
              onClick={() => setTimelineZoom("month")}
            >
              Month
            </Button>
          </div>
        </div>
      </header>

      <section
        ref={timelineRef}
        data-testid="views-timeline-board"
        aria-label="Timeline board"
        className="border-border bg-surface-elevated overflow-x-auto rounded-sm border"
      >
        <div className="min-w-max">
          <div
            className="border-border bg-surface-muted grid border-b"
            style={{
              gridTemplateColumns: `${RAIL_WIDTH} repeat(${range.days.length}, ${DAY_WIDTH})`,
            }}
          >
            <div className="text-muted-foreground flex items-center px-3 py-2 font-mono text-[0.65rem] tracking-[0.12em] uppercase">
              Items
            </div>
            {range.days.map(dayHeader)}
          </div>
          {model.lanes.map((lane) => (
            <TimelineLaneRow
              key={lane.id}
              lane={lane}
              onOpen={onItemOpen}
              dayCount={range.days.length}
            />
          ))}
        </div>
      </section>

      <Unscheduled rows={model.unscheduled} onOpen={onItemOpen} />
    </div>
  );
}
