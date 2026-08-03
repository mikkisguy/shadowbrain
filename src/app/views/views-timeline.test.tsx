// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ViewsGridDataModule from "./use-views-grid-data";
import type { GridRow } from "./types";
import { computeCenteredScrollLeft, ViewsTimeline } from "./views-timeline";

const useViewsGridDataMock = vi.fn();

vi.mock("./use-views-grid-data", async () => {
  const actual = await vi.importActual<typeof ViewsGridDataModule>(
    "./use-views-grid-data"
  );
  return {
    ...actual,
    useViewsGridData: (...args: unknown[]) => useViewsGridDataMock(...args),
  };
});

function localIso(offset: number): string {
  const today = new Date();
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + offset,
    12
  ).toISOString();
}

const rows: GridRow[] = [
  {
    id: "event-planning",
    type: "event",
    title: "Planning session",
    status: "todo",
    startOrDue: localIso(-1),
    end: localIso(2),
    parent: null,
    tags: [],
    updatedAt: localIso(0),
    metadata: { start_date: localIso(-1), end_date: localIso(2) },
  },
  {
    id: "task-agenda",
    type: "task",
    title: "Prepare agenda",
    status: "todo",
    startOrDue: localIso(0),
    end: null,
    parent: { id: "event-planning", title: "Planning session", type: "event" },
    tags: [],
    updatedAt: localIso(0),
    metadata: { start_date: localIso(0), due_date: localIso(1) },
  },
  {
    id: "task-unscheduled",
    type: "task",
    title: "Decide venue",
    status: "todo",
    startOrDue: null,
    end: null,
    parent: null,
    tags: [],
    updatedAt: localIso(0),
    metadata: {},
  },
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

describe("ViewsTimeline", () => {
  const onItemOpen = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    onItemOpen.mockReset();
    useViewsGridDataMock.mockReturnValue({
      data: rows,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  function renderTimeline() {
    return render(
      <QueryWrapper>
        <ViewsTimeline projectId={null} onItemOpen={onItemOpen} />
      </QueryWrapper>
    );
  }

  async function waitForTimeline() {
    await waitFor(() =>
      expect(screen.getByTestId("views-timeline")).toBeInTheDocument()
    );
  }
  it("renders dated event bars and nested task bars", async () => {
    renderTimeline();
    await waitForTimeline();
    expect(
      screen.getByTestId("views-timeline-lane-event-planning")
    ).toHaveTextContent("Planning session");
    expect(
      screen.getByRole("button", {
        name: /Open Event Planning session/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Open Task Prepare agenda under Planning session/,
      })
    ).toBeInTheDocument();
  });

  it("renders undated rows in the unscheduled bucket", async () => {
    renderTimeline();
    await waitForTimeline();

    expect(screen.getByTestId("views-timeline-unscheduled")).toHaveTextContent(
      "Decide venue"
    );
  });

  it("opens events, tasks, and unscheduled items", async () => {
    const user = userEvent.setup();
    renderTimeline();
    await waitForTimeline();
    await user.click(
      screen.getByRole("button", {
        name: /Open Task Prepare agenda under Planning session/,
      })
    );
    expect(onItemOpen).toHaveBeenCalledWith("task-agenda");

    await user.click(
      screen.getByRole("button", { name: /Open Task Decide venue/ })
    );
    expect(onItemOpen).toHaveBeenCalledWith("task-unscheduled");
  });

  it("exposes navigation controls and date jump", async () => {
    renderTimeline();
    await waitForTimeline();
    expect(screen.getByTestId("views-timeline-prev")).toBeInTheDocument();
    expect(screen.getByTestId("views-timeline-today")).toBeInTheDocument();
    expect(screen.getByTestId("views-timeline-next")).toBeInTheDocument();
    expect(screen.getByTestId("views-timeline-date-jump")).toHaveAttribute(
      "aria-label",
      "Jump to date"
    );
  });
  it("defaults to month zoom and persists switching to week", async () => {
    const user = userEvent.setup();
    renderTimeline();
    await waitForTimeline();

    const month = screen.getByTestId("views-timeline-zoom-month");
    const week = screen.getByTestId("views-timeline-zoom-week");
    expect(month).toHaveAttribute("aria-pressed", "true");
    expect(week).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByTestId("views-timeline-zoom-two-week")
    ).toHaveTextContent("2 weeks");
    expect(screen.getByTestId("views-timeline-zoom-quarter")).toHaveTextContent(
      "Quarter"
    );

    await user.click(week);

    expect(week).toHaveAttribute("aria-pressed", "true");
    expect(month).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("views.timeline.zoom")).toBe("week");
    await user.click(screen.getByTestId("views-timeline-zoom-quarter"));
    const quarter = Math.floor(new Date().getMonth() / 3) + 1;
    expect(screen.getByTestId("views-timeline-zoom-quarter")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByText(new RegExp(`Q${quarter} ${new Date().getFullYear()}`))
    ).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });
  it("persists two-week zoom and renders fourteen days", async () => {
    const user = userEvent.setup();
    renderTimeline();
    await waitForTimeline();

    await user.click(screen.getByTestId("views-timeline-zoom-two-week"));

    expect(localStorage.getItem("views.timeline.zoom")).toBe("two_week");
    expect(screen.getByTestId("views-timeline-zoom-two-week")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await waitFor(() => expect(screen.getAllByRole("time")).toHaveLength(14));
  });
  it("applies a pre-seeded two-week zoom with fourteen time columns", async () => {
    localStorage.setItem("views.timeline.zoom", "two_week");
    renderTimeline();

    await waitForTimeline();
    await waitFor(() =>
      expect(
        screen.getByTestId("views-timeline-zoom-two-week")
      ).toHaveAttribute("aria-pressed", "true")
    );
    expect(screen.getAllByRole("time")).toHaveLength(14);
  });
  it("jumps to a picked local date in the current month window", async () => {
    renderTimeline();
    await waitForTimeline();

    const input = screen.getByTestId("views-timeline-date-jump");
    fireEvent.change(input, { target: { value: "2024-06-15" } });

    await waitFor(() => {
      expect(screen.getByText("June 2024")).toBeInTheDocument();
      expect(
        screen
          .getByTestId("views-timeline-board")
          .querySelector('[data-timeline-day="2024-06-15"]')
      ).not.toBeNull();
    });
  });

  it("applies a pre-seeded week zoom after the initial month/loading paint", async () => {
    localStorage.setItem("views.timeline.zoom", "week");
    renderTimeline();

    expect(screen.getByTestId("views-grid-loading")).toBeInTheDocument();
    await waitForTimeline();

    await waitFor(() =>
      expect(screen.getByTestId("views-timeline-zoom-week")).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByTestId("views-timeline-zoom-month")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByTestId("views-timeline-board")).toHaveAttribute(
      "aria-label",
      "Timeline board"
    );
    expect(screen.getAllByRole("time").length).toBe(7);
  });

  it("centers today by assigning clamped scrollLeft on the board scroller", async () => {
    const user = userEvent.setup();
    renderTimeline();
    await waitForTimeline();

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const board = screen.getByTestId("views-timeline-board");
    const day = board.querySelector<HTMLElement>(
      `[data-timeline-day="${todayKey}"]`
    );
    expect(day).not.toBeNull();

    Object.defineProperty(board, "clientWidth", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(board, "scrollWidth", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(day!, "offsetLeft", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(day!, "offsetWidth", {
      configurable: true,
      value: 112,
    });
    Object.defineProperty(day!, "offsetParent", {
      configurable: true,
      value: board,
    });

    const expected = computeCenteredScrollLeft(board, 900, 112);
    expect(expected).toBe(756);

    await user.click(screen.getByTestId("views-timeline-today"));
    await waitFor(() => expect(board.scrollLeft).toBe(756));
  });

  it("keeps parent context on off-window orphan and unscheduled children", async () => {
    useViewsGridDataMock.mockReturnValue({
      data: [
        {
          id: "event-old",
          type: "event",
          title: "Conference launch",
          status: "todo",
          startOrDue: "2024-01-01",
          end: "2024-01-03",
          parent: null,
          tags: [],
          updatedAt: localIso(0),
          metadata: { start_date: "2024-01-01", end_date: "2024-01-03" },
        },
        {
          id: "task-orphan-visible",
          type: "task",
          title: "Visible orphan child",
          status: "todo",
          startOrDue: localIso(0),
          end: localIso(1),
          parent: {
            id: "event-old",
            title: "Conference launch",
            type: "event",
          },
          tags: [],
          updatedAt: localIso(0),
          metadata: { start_date: localIso(0), due_date: localIso(1) },
        },
        {
          id: "task-offwindow-undated",
          type: "task",
          title: "Off-window undated",
          status: "todo",
          startOrDue: null,
          end: null,
          parent: {
            id: "event-old",
            title: "Conference launch",
            type: "event",
          },
          tags: [],
          updatedAt: localIso(0),
          metadata: {},
        },
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderTimeline();

    expect(
      await screen.findByRole("button", {
        name: /Open Task lane Visible orphan child under Conference launch/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Open Task Visible orphan child under Conference launch/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Open Task Off-window undated under Conference launch/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId("views-timeline-unscheduled")).toHaveTextContent(
      "under Conference launch"
    );
  });
});

describe("computeCenteredScrollLeft", () => {
  it("centers the day column inside the visible scroller", () => {
    expect(
      computeCenteredScrollLeft(
        { clientWidth: 400, scrollWidth: 2000 },
        900,
        112
      )
    ).toBe(756);
  });

  it("clamps to the max scrollable range", () => {
    expect(
      computeCenteredScrollLeft(
        { clientWidth: 400, scrollWidth: 500 },
        900,
        112
      )
    ).toBe(100);
  });

  it("clamps to zero when the day is near the start", () => {
    expect(
      computeCenteredScrollLeft(
        { clientWidth: 400, scrollWidth: 2000 },
        40,
        112
      )
    ).toBe(0);
  });
});
