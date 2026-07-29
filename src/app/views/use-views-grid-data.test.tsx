// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  mapListItemToGridRow,
  mapListItemsToGridRows,
  mapRelatedItemToGridRow,
  mapRelatedItemsToGridRows,
} from "./use-views-grid-data";

describe("mapRelatedItemToGridRow", () => {
  it("maps event and task related items into grid rows", () => {
    const event = mapRelatedItemToGridRow({
      id: "e1",
      type: "event",
      title: "Sprint",
      status: "in_progress",
      dates: {
        start_date: "2025-01-01T10:00:00.000Z",
        end_date: "2025-01-02T10:00:00.000Z",
        due_date: null,
      },
      tags: ["work"],
      parent: null,
      updated_at: "2025-01-03T12:00:00.000Z",
    });

    expect(event).toEqual({
      id: "e1",
      type: "event",
      title: "Sprint",
      status: "in_progress",
      startOrDue: "2025-01-01T10:00:00.000Z",
      end: "2025-01-02T10:00:00.000Z",
      parent: null,
      tags: ["work"],
      updatedAt: "2025-01-03T12:00:00.000Z",
      metadata: {
        status: "in_progress",
        start_date: "2025-01-01T10:00:00.000Z",
        end_date: "2025-01-02T10:00:00.000Z",
      },
    });

    const task = mapRelatedItemToGridRow({
      id: "t1",
      type: "task",
      title: "Ship",
      status: "todo",
      dates: {
        start_date: "2025-02-01T10:00:00.000Z",
        end_date: null,
        due_date: "2025-02-05T10:00:00.000Z",
      },
      tags: [],
      parent: { id: "e1", title: "Sprint", type: "event" },
      updated_at: "2025-02-02T08:00:00.000Z",
    });

    expect(task?.startOrDue).toBe("2025-02-05T10:00:00.000Z");
    expect(task?.parent?.title).toBe("Sprint");
  });

  it("filters out non event/task related items", () => {
    expect(
      mapRelatedItemsToGridRows([
        {
          id: "n1",
          type: "note",
          title: "Note",
          status: null,
          dates: {
            start_date: null,
            end_date: null,
            due_date: null,
          },
          tags: [],
          parent: null,
          updated_at: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "t1",
          type: "task",
          title: "Task",
          status: "done",
          dates: {
            start_date: null,
            end_date: null,
            due_date: "2025-03-01T00:00:00.000Z",
          },
          tags: [],
          parent: null,
          updated_at: "2025-03-02T00:00:00.000Z",
        },
      ])
    ).toHaveLength(1);
  });
});

describe("mapListItemToGridRow", () => {
  it("parses metadata for global list rows", () => {
    const row = mapListItemToGridRow({
      id: "t2",
      type: "task",
      title: "Global task",
      metadata: JSON.stringify({
        status: "in_progress",
        due_date: "2025-04-01T00:00:00.000Z",
        start_date: "2025-03-20T00:00:00.000Z",
      }),
      tags: ["ops"],
      updated_at: "2025-04-02T00:00:00.000Z",
    });

    expect(row).toMatchObject({
      startOrDue: "2025-04-01T00:00:00.000Z",
      parent: null,
      tags: ["ops"],
      updatedAt: "2025-04-02T00:00:00.000Z",
      metadata: {
        status: "in_progress",
        due_date: "2025-04-01T00:00:00.000Z",
        start_date: "2025-03-20T00:00:00.000Z",
      },
    });
  });

  it("merges global events and tasks", () => {
    const rows = mapListItemsToGridRows([
      {
        id: "e1",
        type: "event",
        title: "Event",
        metadata: JSON.stringify({ start_date: "2025-05-01T00:00:00.000Z" }),
        tags: [],
        updated_at: "2025-05-02T00:00:00.000Z",
      },
      {
        id: "t1",
        type: "task",
        title: "Task",
        metadata: JSON.stringify({ due_date: "2025-05-03T00:00:00.000Z" }),
        tags: [],
        updated_at: "2025-05-04T00:00:00.000Z",
      },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["e1", "t1"]);
  });
});
