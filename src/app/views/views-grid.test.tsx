// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import type { GridRow } from "./types";
import { sortGridRows, ViewsGrid } from "./views-grid";

vi.mock("./workflow-status-strip", () => ({
  WorkflowStatusStrip: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label="Status"
      value={value ?? "todo"}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="todo">To Do</option>
      <option value="done">Done</option>
    </select>
  ),
}));

const rows: GridRow[] = [
  {
    id: "b",
    type: "task",
    title: "Beta",
    status: "todo",
    startOrDue: "2025-02-01T00:00:00.000Z",
    end: null,
    parent: null,
    tags: [],
    updatedAt: "2025-02-02T00:00:00.000Z",
    metadata: {},
  },
  {
    id: "a",
    type: "event",
    title: "Alpha",
    status: "done",
    startOrDue: "2025-01-01T00:00:00.000Z",
    end: "2025-01-02T00:00:00.000Z",
    parent: null,
    tags: ["work"],
    updatedAt: "2025-01-03T00:00:00.000Z",
    metadata: {},
  },
];

const useViewsGridDataMock = vi.fn();
const useViewsGridMutationMock = vi.fn();

vi.mock("./use-views-grid-data", async () => {
  const actual = await vi.importActual<typeof import("./use-views-grid-data")>(
    "./use-views-grid-data"
  );
  return {
    ...actual,
    useViewsGridData: (...args: unknown[]) => useViewsGridDataMock(...args),
  };
});

vi.mock("./use-views-grid-mutation", () => ({
  mergeGridMetadata: (
    existing: Record<string, unknown>,
    changes: Record<string, unknown>
  ) => ({ ...existing, ...changes }),
  useViewsGridMutation: (...args: unknown[]) =>
    useViewsGridMutationMock(...args),
}));

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

describe("sortGridRows", () => {
  it("sorts by title and toggles direction", () => {
    expect(sortGridRows(rows, "title", "asc").map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    expect(sortGridRows(rows, "title", "desc").map((row) => row.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("sorts by schedule and updated dates", () => {
    expect(
      sortGridRows(rows, "scheduleDate", "asc").map((row) => row.id)
    ).toEqual(["a", "b"]);
    expect(
      sortGridRows(rows, "updatedAt", "desc").map((row) => row.id)
    ).toEqual(["b", "a"]);
  });
});

describe("ViewsGrid", () => {
  const mutate = vi.fn();
  const onRowOpen = vi.fn();

  beforeEach(() => {
    mutate.mockReset();
    onRowOpen.mockReset();
    useViewsGridDataMock.mockReturnValue({
      data: rows,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useViewsGridMutationMock.mockReturnValue({ mutate });
  });

  it("toggles sort when clicking headers", async () => {
    const user = userEvent.setup();

    render(
      <QueryWrapper>
        <ViewsGrid projectId={null} onRowOpen={onRowOpen} />
      </QueryWrapper>
    );
    const rowOrder = () =>
      screen
        .getAllByTestId(/views-grid-row-/)
        .map((row) =>
          row.getAttribute("data-testid")?.replace("views-grid-row-", "")
        );

    expect(rowOrder()).toEqual(["a", "b"]);

    await user.click(screen.getByTestId("sort-title"));

    expect(rowOrder()).toEqual(["b", "a"]);
  });

  it("opens a row when clicking outside interactive cells", async () => {
    const user = userEvent.setup();

    render(
      <QueryWrapper>
        <ViewsGrid projectId={null} onRowOpen={onRowOpen} />
      </QueryWrapper>
    );

    await user.click(screen.getByText("Alpha"));
    expect(onRowOpen).toHaveBeenCalledWith("a");
  });
});
