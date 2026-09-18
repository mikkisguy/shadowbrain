// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ViewsGridDataModule from "./use-views-grid-data";
import type { GridRow } from "./types";
import {
  executeKanbanMove,
  filterKanbanRows,
  groupRowsByStatus,
  matchesKanbanQuery,
  planKanbanMove,
  ViewsKanban,
} from "./views-kanban";

const useViewsGridDataMock = vi.fn();
const useViewsKanbanMutationMock = vi.fn();

vi.mock("./use-views-grid-data", async () => {
  const actual = await vi.importActual<typeof ViewsGridDataModule>(
    "./use-views-grid-data"
  );
  return {
    ...actual,
    useViewsGridData: (...args: unknown[]) => useViewsGridDataMock(...args),
  };
});

vi.mock("./use-views-kanban-mutation", () => ({
  useViewsKanbanMutation: (...args: unknown[]) =>
    useViewsKanbanMutationMock(...args),
}));
const rows: GridRow[] = [
  {
    id: "event-todo",
    type: "event",
    title: "Team offsite",
    status: "todo",
    startOrDue: "2025-06-03T00:00:00.000Z",
    end: null,
    parent: null,
    tags: ["planning"],
    updatedAt: "2025-05-01T00:00:00.000Z",
    metadata: { status: "todo" },
  },
  {
    id: "task-progress",
    type: "task",
    title: "Book venue",
    status: "in_progress",
    startOrDue: "2025-06-01T00:00:00.000Z",
    end: null,
    parent: { id: "event-todo", title: "Team offsite", type: "event" },
    tags: [],
    updatedAt: "2025-05-02T00:00:00.000Z",
    metadata: { status: "in_progress" },
  },
  ...Array.from({ length: 9 }, (_, index): GridRow => ({
    id: `done-${index + 1}`,
    type: "task",
    title: `Completed task ${index + 1}`,
    status: "done",
    startOrDue: null,
    end: null,
    parent: null,
    tags: [],
    updatedAt: "2025-05-03T00:00:00.000Z",
    metadata: { status: "done" },
  })),
];

function QueryWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Kanban filters", () => {
  it("matches title, parent title, type, and tags with OR semantics", () => {
    expect(matchesKanbanQuery(rows[0], "offsite")).toBe(true);
    expect(matchesKanbanQuery(rows[1], "team offsite")).toBe(true);
    expect(matchesKanbanQuery(rows[1], "TASK")).toBe(true);
    expect(matchesKanbanQuery(rows[0], "PLANNING")).toBe(true);
    expect(matchesKanbanQuery(rows[0], "venue")).toBe(false);
    expect(filterKanbanRows(rows, "venue").map((row) => row.id)).toEqual([
      "task-progress",
    ]);
  });

  it("trims queries, matches case-insensitively, and restores all for empty input", () => {
    expect(matchesKanbanQuery(rows[0], "  TEAM OFFSITE  ")).toBe(true);
    expect(filterKanbanRows(rows, "  ")).toEqual(rows);
    expect(filterKanbanRows(rows, "")).toEqual(rows);
  });
});

describe("groupRowsByStatus", () => {
  it("groups known statuses and assigns invalid statuses to To Do", () => {
    const invalid: GridRow = {
      ...rows[0],
      id: "unknown-status",
      status: "not-a-workflow-status",
      metadata: { status: "not-a-workflow-status" },
    };

    const grouped = groupRowsByStatus([rows[0], rows[1], rows[2], invalid]);

    expect(grouped.todo.map((row) => row.id)).toEqual([
      "event-todo",
      "unknown-status",
    ]);
    expect(grouped.in_progress.map((row) => row.id)).toEqual(["task-progress"]);
    expect(grouped.done.map((row) => row.id)).toEqual(["done-1"]);
  });
});

describe("planKanbanMove", () => {
  it("plans a valid move with the full row payload", () => {
    const row = rows[0];
    expect(
      planKanbanMove({
        activeId: row.id,
        overId: "in_progress",
        rows,
      })
    ).toEqual({
      id: row.id,
      type: row.type,
      fromStatus: "todo",
      toStatus: "in_progress",
      metadata: row.metadata,
    });
  });

  it.each([
    { overId: null, label: "missing target" },
    { overId: "event-todo", label: "invalid target" },
    { overId: "todo", label: "same status target" },
  ])("does not plan a move for $label", ({ overId }) => {
    expect(
      planKanbanMove({
        activeId: "event-todo",
        overId,
        rows,
      })
    ).toBeNull();
  });
});

describe("executeKanbanMove", () => {
  it("calls moveCard with a valid plan", () => {
    const moveCard = vi.fn();
    executeKanbanMove({
      activeId: "event-todo",
      overId: "in_progress",
      rows,
      moveCard,
    });

    expect(moveCard).toHaveBeenCalledWith({
      id: "event-todo",
      type: "event",
      fromStatus: "todo",
      toStatus: "in_progress",
      metadata: rows[0].metadata,
    });
  });

  it.each([
    { overId: null, label: "missing target" },
    { overId: "event-todo", label: "invalid target" },
    { overId: "todo", label: "same status target" },
  ])("does not call moveCard for $label", ({ overId }) => {
    const moveCard = vi.fn();
    executeKanbanMove({
      activeId: "event-todo",
      overId,
      rows,
      moveCard,
    });

    expect(moveCard).not.toHaveBeenCalled();
  });
});

describe("ViewsKanban", () => {
  const moveCard = vi.fn();
  const onCardOpen = vi.fn();

  beforeEach(() => {
    moveCard.mockReset();
    onCardOpen.mockReset();
    useViewsGridDataMock.mockReturnValue({
      data: rows,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useViewsKanbanMutationMock.mockReturnValue({ moveCard });
  });

  function renderKanban() {
    return render(
      <QueryWrapper>
        <ViewsKanban projectId={null} onCardOpen={onCardOpen} />
      </QueryWrapper>
    );
  }

  it("renders event and task cards in status columns with their counts", () => {
    renderKanban();

    expect(screen.getByTestId("views-kanban")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-todo")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-in_progress")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-done")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-count-todo")).toHaveTextContent(
      "1"
    );
    expect(
      screen.getByTestId("kanban-column-count-in_progress")
    ).toHaveTextContent("1");
    expect(screen.getByTestId("kanban-column-count-done")).toHaveTextContent(
      "9"
    );
    expect(screen.getByTestId("kanban-card-event-todo")).toHaveTextContent(
      "Team offsite"
    );
    expect(screen.getByTestId("kanban-card-task-progress")).toHaveTextContent(
      "Book venue"
    );
    expect(screen.getByText("Event")).toBeInTheDocument();
    expect(screen.getAllByText("Task").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Drag Team offsite" })
    ).toBeInTheDocument();
  });

  it("filters visible cards and column counts, then clearing restores the board", async () => {
    const user = userEvent.setup();
    renderKanban();

    const filter = screen.getByTestId("kanban-filter");
    await user.type(filter, "venue");

    expect(
      screen.queryByTestId("kanban-card-event-todo")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("kanban-card-task-progress")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-count-todo")).toHaveTextContent(
      "0"
    );
    expect(
      screen.getByTestId("kanban-column-count-in_progress")
    ).toHaveTextContent("1");
    expect(screen.getByTestId("kanban-column-count-done")).toHaveTextContent(
      "0"
    );

    await user.clear(filter);

    expect(screen.getByTestId("kanban-card-event-todo")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-count-done")).toHaveTextContent(
      "9"
    );
  });

  it("distinguishes no matches from an empty board and provides a clear control", async () => {
    const user = userEvent.setup();
    renderKanban();

    await user.type(screen.getByTestId("kanban-filter"), "does not exist");

    expect(screen.getByTestId("kanban-no-matches")).toHaveTextContent(
      "No cards match"
    );
    expect(screen.getByTestId("kanban-filter-clear")).toBeInTheDocument();
    expect(screen.getByTestId("views-kanban")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-count-todo")).toHaveTextContent(
      "0"
    );
    expect(screen.getByTestId("views-kanban")).not.toHaveTextContent(
      "Team offsite"
    );

    await user.click(screen.getByTestId("kanban-filter-clear"));
    expect(screen.queryByTestId("kanban-no-matches")).not.toBeInTheDocument();
    expect(screen.getByTestId("kanban-card-event-todo")).toBeInTheDocument();
  });

  it("shows the parent crumb and opens a card on click", async () => {
    const user = userEvent.setup();
    renderKanban();

    expect(screen.getByTestId("kanban-card-task-progress")).toHaveTextContent(
      "Team offsite"
    );
    await user.click(screen.getByRole("button", { name: "Open Book venue" }));

    expect(onCardOpen).toHaveBeenCalledWith("task-progress");
  });

  it("collapses Done to eight cards by default and expands it on demand", async () => {
    const user = userEvent.setup();
    renderKanban();

    expect(screen.getByTestId("kanban-done-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-card-done-8")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-card-done-9")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("kanban-done-toggle"));

    expect(screen.getByTestId("kanban-card-done-9")).toBeInTheDocument();

    await user.click(screen.getByTestId("kanban-done-toggle"));

    expect(screen.queryByTestId("kanban-card-done-9")).not.toBeInTheDocument();
  });

  it("uses the shared loading, error, and empty states for data outcomes", () => {
    useViewsGridDataMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const { rerender } = renderKanban();
    expect(screen.getByTestId("views-grid-loading")).toHaveAttribute(
      "aria-label",
      "Loading Kanban board"
    );

    useViewsGridDataMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("Unable to load"),
      refetch: vi.fn(),
    });
    rerender(
      <QueryWrapper>
        <ViewsKanban projectId={null} onCardOpen={onCardOpen} />
      </QueryWrapper>
    );
    expect(screen.getByTestId("views-grid-error")).toHaveTextContent(
      "Unable to load"
    );

    useViewsGridDataMock.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender(
      <QueryWrapper>
        <ViewsKanban projectId={null} onCardOpen={onCardOpen} />
      </QueryWrapper>
    );
    expect(screen.getByTestId("views-grid-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-no-matches")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kanban-filter")).not.toBeInTheDocument();
  });
});
