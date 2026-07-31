// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GridRow } from "./types";
import {
  buildTimelineModel,
  buildTimelineRange,
  coerceTimelineZoom,
  DEFAULT_TIMELINE_ZOOM,
  getTimelineLaneMinHeight,
  readStoredTimelineZoom,
  resolveItemSpan,
  shiftTimelineAnchor,
  TIMELINE_ZOOM_STORAGE_KEY,
  writeStoredTimelineZoom,
} from "./views-timeline-layout";

function row(overrides: Partial<GridRow> = {}): GridRow {
  return {
    id: "row-1",
    type: "task",
    title: "Row",
    status: "todo",
    startOrDue: null,
    end: null,
    parent: null,
    tags: [],
    updatedAt: "2025-01-01T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("timeline zoom persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("coerces unknown values to the month default", () => {
    expect(DEFAULT_TIMELINE_ZOOM).toBe("month");
    expect(coerceTimelineZoom("week")).toBe("week");
    expect(coerceTimelineZoom("month")).toBe("month");
    expect(coerceTimelineZoom("day")).toBe("month");
    expect(coerceTimelineZoom(null)).toBe("month");
  });

  it("persists the selected zoom in localStorage", () => {
    expect(TIMELINE_ZOOM_STORAGE_KEY).toBe("views.timeline.zoom");

    writeStoredTimelineZoom("week");
    expect(localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY)).toBe("week");
    expect(readStoredTimelineZoom()).toBe("week");

    writeStoredTimelineZoom("month");
    expect(readStoredTimelineZoom()).toBe("month");
  });

  it("falls back safely when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(readStoredTimelineZoom()).toBe(DEFAULT_TIMELINE_ZOOM);
    expect(() => writeStoredTimelineZoom("week")).not.toThrow();
  });
});

describe("buildTimelineRange", () => {
  it("builds every local day in the anchor month", () => {
    const range = buildTimelineRange(new Date(2024, 1, 12), "month");

    expect(localDate(range.start)).toBe("2024-02-01");
    expect(localDate(range.end)).toBe("2024-03-01");
    expect(range.days).toHaveLength(29);
    expect(range.days[0].key).toBe("2024-02-01");
    expect(range.days.at(-1)?.key).toBe("2024-02-29");
  });

  it("builds the Monday-start week containing the anchor", () => {
    const range = buildTimelineRange(new Date(2024, 1, 14), "week");

    expect(localDate(range.start)).toBe("2024-02-12");
    expect(localDate(range.end)).toBe("2024-02-19");
    expect(range.days).toHaveLength(7);
    expect(range.days[0]).toMatchObject({ key: "2024-02-12", label: "Mon 12" });
    expect(range.days.at(-1)).toMatchObject({
      key: "2024-02-18",
      label: "Sun 18",
    });
  });
});

describe("shiftTimelineAnchor", () => {
  it("moves a month anchor by one calendar month", () => {
    const anchor = new Date(2025, 0, 15, 12);
    expect(localDate(shiftTimelineAnchor(anchor, "month", -1))).toBe(
      "2024-12-15"
    );
    expect(localDate(shiftTimelineAnchor(anchor, "month", 1))).toBe(
      "2025-02-15"
    );
  });

  it("clamps a month shift when the target month is shorter", () => {
    expect(
      localDate(shiftTimelineAnchor(new Date(2025, 0, 31), "month", 1))
    ).toBe("2025-02-28");
  });

  it("moves a week anchor by seven local days", () => {
    const anchor = new Date(2025, 0, 15, 12);
    expect(localDate(shiftTimelineAnchor(anchor, "week", -1))).toBe(
      "2025-01-08"
    );
    expect(localDate(shiftTimelineAnchor(anchor, "week", 1))).toBe(
      "2025-01-22"
    );
  });
});

describe("resolveItemSpan", () => {
  it("resolves event metadata dates with the event end inclusive", () => {
    const span = resolveItemSpan(
      row({
        type: "event",
        startOrDue: "2025-01-02",
        end: "2025-01-04",
        metadata: {
          start_date: "2025-01-10",
          end_date: "2025-01-12",
        },
      })
    );

    expect(span && localDate(span.start)).toBe("2025-01-10");
    expect(span && localDate(span.end)).toBe("2025-01-12");
  });

  it("resolves task due-only dates", () => {
    const span = resolveItemSpan(
      row({
        type: "task",
        metadata: { due_date: "2025-02-03" },
      })
    );

    expect(span && localDate(span.start)).toBe("2025-02-03");
    expect(span && localDate(span.end)).toBe("2025-02-03");
  });

  it("resolves task start plus due as a multi-day span", () => {
    const span = resolveItemSpan(
      row({
        type: "task",
        metadata: { start_date: "2025-02-01", due_date: "2025-02-03" },
      })
    );

    expect(span && localDate(span.start)).toBe("2025-02-01");
    expect(span && localDate(span.end)).toBe("2025-02-03");
  });

  it("resolves task start and end metadata", () => {
    const span = resolveItemSpan(
      row({
        type: "task",
        metadata: { start_date: "2025-02-10", end_date: "2025-02-12" },
      })
    );

    expect(span && localDate(span.start)).toBe("2025-02-10");
    expect(span && localDate(span.end)).toBe("2025-02-12");
  });

  it("prefers task end over due when all metadata dates are present", () => {
    const span = resolveItemSpan(
      row({
        type: "task",
        metadata: {
          start_date: "2025-02-10",
          end_date: "2025-02-12",
          due_date: "2025-02-15",
        },
      })
    );

    expect(span && localDate(span.start)).toBe("2025-02-10");
    expect(span && localDate(span.end)).toBe("2025-02-12");
  });

  it("clamps reversed task start and end dates", () => {
    const span = resolveItemSpan(
      row({
        type: "task",
        metadata: { start_date: "2025-02-12", end_date: "2025-02-10" },
      })
    );

    expect(span && localDate(span.start)).toBe("2025-02-12");
    expect(span && localDate(span.end)).toBe("2025-02-12");
  });

  it("uses top-level task startOrDue and end fallbacks", () => {
    const span = resolveItemSpan(
      row({
        type: "task",
        startOrDue: "2025-03-01",
        end: "2025-03-04",
        metadata: {},
      })
    );

    expect(span && localDate(span.start)).toBe("2025-03-01");
    expect(span && localDate(span.end)).toBe("2025-03-04");
  });

  it("returns null when a task has no dates", () => {
    expect(resolveItemSpan(row({ type: "task" }))).toBeNull();
  });

  it("uses a single day for start-only and end-only tasks", () => {
    const startOnly = resolveItemSpan(
      row({ type: "task", metadata: { start_date: "2025-03-05" } })
    );
    const endOnly = resolveItemSpan(
      row({ type: "task", metadata: { end_date: "2025-03-06" } })
    );

    expect(startOnly && localDate(startOnly.start)).toBe("2025-03-05");
    expect(startOnly && localDate(startOnly.end)).toBe("2025-03-05");
    expect(endOnly && localDate(endOnly.start)).toBe("2025-03-06");
    expect(endOnly && localDate(endOnly.end)).toBe("2025-03-06");
  });
});

describe("timeline lane geometry", () => {
  it("leaves bottom padding for one, two, and three nested tasks", () => {
    expect(getTimelineLaneMinHeight(1)).toBeCloseTo(5.4);
    expect(getTimelineLaneMinHeight(2)).toBeCloseTo(7.1);
    expect(getTimelineLaneMinHeight(3)).toBeCloseTo(8.8);
  });
});

describe("buildTimelineModel", () => {
  const rangeStart = new Date(2025, 0, 1);
  const rangeEnd = new Date(2025, 1, 1);

  it("nests dated and undated tasks under an event", () => {
    const event = row({
      id: "event-1",
      type: "event",
      title: "Launch",
      startOrDue: "2025-01-10",
      end: "2025-01-20",
      metadata: {},
    });
    const datedTask = row({
      id: "task-1",
      title: "Prepare",
      startOrDue: "2025-01-12",
      parent: { id: event.id, title: event.title, type: "event" },
    });
    const undatedTask = row({
      id: "task-2",
      title: "Review",
      parent: { id: event.id, title: event.title, type: "event" },
    });

    const model = buildTimelineModel(
      [event, datedTask, undatedTask],
      rangeStart,
      rangeEnd
    );
    const lane = model.lanes.find((item) => item.id === event.id);

    expect(lane?.kind).toBe("event");
    expect(
      lane?.nestedTasks.map((task) => [task.row.id, task.placement])
    ).toEqual([
      ["task-1", "bar"],
      ["task-2", "chip"],
    ]);
    expect(lane?.nestedTasks[1].leftPct).toBeGreaterThanOrEqual(0);
    expect(lane?.nestedTasks[1].leftPct).toBeLessThanOrEqual(100);
    expect(lane?.nestedTasks[1].widthPct).toBe(2);
  });

  it("puts undated children of off-window events in unscheduled", () => {
    const event = row({
      id: "off-window-event",
      type: "event",
      title: "Previous launch",
      startOrDue: "2024-01-10",
      end: "2024-01-20",
      metadata: {},
    });
    const child = row({
      id: "off-window-child",
      title: "Unscheduled review",
      parent: { id: event.id, title: event.title, type: "event" },
    });

    const model = buildTimelineModel(
      [event, child],
      new Date(2025, 0, 1),
      new Date(2025, 1, 1)
    );

    expect(model.lanes).toEqual([]);
    expect(model.unscheduled.map((item) => item.id)).toEqual([child.id]);
  });

  it("renders in-range dated children of off-window events as orphan lanes", () => {
    const event = row({
      id: "old-event",
      type: "event",
      title: "Last year",
      startOrDue: "2024-01-01",
      end: "2024-01-03",
      metadata: { start_date: "2024-01-01", end_date: "2024-01-03" },
    });
    const datedChild = row({
      id: "dated-child-visible",
      title: "Still due",
      startOrDue: "2025-01-15",
      parent: { id: event.id, title: event.title, type: "event" },
      metadata: { due_date: "2025-01-15" },
    });

    const model = buildTimelineModel([event, datedChild], rangeStart, rangeEnd);

    expect(model.lanes.map((lane) => lane.id)).toEqual(["dated-child-visible"]);
    expect(model.lanes[0]).toMatchObject({
      id: "dated-child-visible",
      kind: "orphan-task",
      bar: {
        leftPct: expect.any(Number),
        widthPct: expect.any(Number),
      },
      nestedTasks: [],
    });
    expect(model.unscheduled).toEqual([]);
  });

  it("puts undated events and tasks in unscheduled", () => {
    const event = row({ id: "undated-event", type: "event", title: "No date" });
    const task = row({ id: "undated-task", title: "No due date" });

    const model = buildTimelineModel([event, task], rangeStart, rangeEnd);

    expect(model.lanes).toHaveLength(0);
    expect(model.unscheduled.map((item) => item.id)).toEqual([
      "undated-event",
      "undated-task",
    ]);
  });

  it("keeps dated children of undated events visible", () => {
    const event = row({
      id: "undated-event",
      type: "event",
      title: "No date",
    });
    const datedChild = row({
      id: "dated-child",
      title: "Dated child",
      startOrDue: "2025-01-15",
      parent: { id: event.id, title: event.title, type: "event" },
    });
    const undatedChild = row({
      id: "undated-child",
      title: "Undated child",
      parent: { id: event.id, title: event.title, type: "event" },
    });

    const model = buildTimelineModel(
      [event, datedChild, undatedChild],
      rangeStart,
      rangeEnd
    );
    const orphanLane = model.lanes.find((lane) => lane.id === datedChild.id);

    expect(orphanLane).toMatchObject({
      id: "dated-child",
      kind: "orphan-task",
      bar: {
        leftPct: expect.any(Number),
        widthPct: expect.any(Number),
      },
    });
    expect(orphanLane?.bar?.leftPct).toBeGreaterThanOrEqual(0);
    expect(
      (orphanLane?.bar?.leftPct ?? 0) + (orphanLane?.bar?.widthPct ?? 0)
    ).toBeLessThanOrEqual(100);
    expect(model.unscheduled.map((item) => item.id)).toEqual([
      "undated-event",
      "undated-child",
    ]);
  });

  it("creates a lane for an orphan dated task", () => {
    const task = row({
      id: "orphan",
      title: "Standalone",
      startOrDue: "2025-01-15",
      parent: { id: "missing-event", title: "Missing", type: "event" },
    });

    const model = buildTimelineModel([task], rangeStart, rangeEnd);

    expect(model.lanes).toHaveLength(1);
    expect(model.lanes[0]).toMatchObject({ id: "orphan", kind: "orphan-task" });
  });

  it("clips a bar to the visible range and keeps percentages bounded", () => {
    const task = row({
      id: "clipped",
      type: "task",
      startOrDue: "2024-12-28",
      metadata: { start_date: "2024-12-28", end_date: "2025-01-03" },
    });

    const model = buildTimelineModel([task], rangeStart, rangeEnd);
    const bar = model.lanes[0].bar;

    expect(bar?.leftPct).toBe(0);
    expect(bar?.widthPct).toBeCloseTo((3 / 31) * 100);
    expect(bar?.leftPct).toBeGreaterThanOrEqual(0);
    expect((bar?.leftPct ?? 0) + (bar?.widthPct ?? 0)).toBeLessThanOrEqual(100);
  });
});
