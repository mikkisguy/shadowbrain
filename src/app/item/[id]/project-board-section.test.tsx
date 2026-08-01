// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectBoardSection } from "./project-board-section";

vi.mock("@/app/browse/item-preview-sheet", () => ({
  ItemPreviewSheet: () => null,
}));

vi.mock("@/app/views/views-grid", () => ({
  ViewsGrid: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="mock-views-grid">Grid: {projectId}</div>
  ),
}));

vi.mock("@/app/views/views-timeline", () => ({
  ViewsTimeline: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="mock-views-timeline">Timeline: {projectId}</div>
  ),
}));

vi.mock("@/app/views/views-kanban", () => ({
  ViewsKanban: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="mock-views-kanban">Kanban: {projectId}</div>
  ),
}));

describe("ProjectBoardSection", () => {
  it("shows linked project views and deep-link CTAs", () => {
    render(<ProjectBoardSection projectId="project-1" />);

    expect(screen.getByTestId("project-board-section")).toBeInTheDocument();
    expect(screen.getByTestId("mock-views-grid")).toHaveTextContent(
      "project-1"
    );
    expect(screen.getByTestId("project-board-add-task")).toHaveAttribute(
      "href",
      "/add?type=task&project=project-1"
    );
    expect(screen.getByTestId("project-board-add-event")).toHaveAttribute(
      "href",
      "/add?type=event&project=project-1"
    );
  });

  it("switches between grid, timeline, and kanban", async () => {
    const user = userEvent.setup();
    render(<ProjectBoardSection projectId="project-1" />);

    await user.click(screen.getByTestId("views-tab-timeline"));
    expect(screen.getByTestId("mock-views-timeline")).toHaveTextContent(
      "project-1"
    );
    expect(screen.queryByTestId("mock-views-grid")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("views-tab-kanban"));
    expect(screen.getByTestId("mock-views-kanban")).toHaveTextContent(
      "project-1"
    );
    expect(screen.queryByTestId("mock-views-timeline")).not.toBeInTheDocument();
  });
});
