// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-config";

import {
  fetchGlobalGridRows,
  fetchProjectGridRows,
  mapListItemToGridRow,
  mapListItemsToGridRows,
  mapRelatedItemToGridRow,
  mapRelatedItemsToGridRows,
} from "./use-views-grid-data";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
      metadata: JSON.stringify({
        status: "in_progress",
        start_date: "2025-01-01T10:00:00.000Z",
        end_date: "2025-01-02T10:00:00.000Z",
        duration: 2,
        custom_field: "preserved",
      }),
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
        duration: 2,
        custom_field: "preserved",
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
      metadata: null,
      tags: [],
      parent: { id: "e1", title: "Sprint", type: "event" },
      updated_at: "2025-02-02T08:00:00.000Z",
    });

    expect(task?.startOrDue).toBe("2025-02-05T10:00:00.000Z");
    expect(task?.parent?.title).toBe("Sprint");
    expect(task?.metadata).toEqual({
      status: "todo",
      start_date: "2025-02-01T10:00:00.000Z",
      due_date: "2025-02-05T10:00:00.000Z",
    });
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
          metadata: null,
          tags: [],
          parent: null,
          updated_at: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "t1",
          type: "task",
          title: "Task",
          status: null,
          dates: {
            start_date: null,
            end_date: null,
            due_date: "2025-03-01T00:00:00.000Z",
          },
          metadata: null,
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

describe("fetchGlobalGridRows", () => {
  it("loads every page when a type has more than 100 items", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      const type = url.searchParams.get("type");
      const page = Number(url.searchParams.get("page"));

      if (type === "event") {
        const items =
          page === 1
            ? Array.from({ length: 100 }, (_, index) => ({
                id: `event-${index}`,
                type: "event",
                title: `Event ${index}`,
                metadata: JSON.stringify({ duration: index }),
                tags: [],
                updated_at: "2025-01-01T00:00:00.000Z",
              }))
            : [
                {
                  id: "event-100",
                  type: "event",
                  title: "Event 100",
                  metadata: JSON.stringify({ custom: "preserved" }),
                  tags: [],
                  updated_at: "2025-01-01T00:00:00.000Z",
                },
              ];
        return {
          ok: true,
          json: async () => ({ items, total: 101, page, limit: 100 }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ items: [], total: 0, page, limit: 100 }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchGlobalGridRows();

    expect(rows).toHaveLength(101);
    expect(rows[100]).toMatchObject({
      id: "event-100",
      metadata: { custom: "preserved" },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      "/api/items?type=event&limit=100&page=2"
    );
  });
});

describe("fetchProjectGridRows", () => {
  it("requests opted-in hidden and private related items", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await fetchProjectGridRows("project-1", undefined, {
      includeHidden: true,
      includePrivate: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/project-1/related?include_hidden=1&include_private=1",
      { credentials: "same-origin", signal: undefined }
    );
  });
});

describe("views grid query keys", () => {
  it("keeps visibility scopes in the cache identity", () => {
    expect(queryKeys.views.grid("project-1")).not.toEqual(
      queryKeys.views.grid("project-1", {
        includeHidden: true,
        includePrivate: true,
      })
    );
  });
});
