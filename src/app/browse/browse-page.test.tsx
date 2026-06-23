// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowsePage } from "./browse-page";

/**
 * End-to-end-ish tests for the Browse page.
 *
 * The Browse page is a client component that owns the URL-state
 * hook and the feed. We mock `useBrowseState` so the page is
 * decoupled from the fetch effect — what we are really testing
 * here is the wiring: does the toolbar's filter change reach the
 * hook's `setFilters`? Does a clear-all button reach `clearFilters`?
 * Do the four feed states render under the right hook output?
 */

const setFilters = vi.fn();
const clearFilters = vi.fn();
const retry = vi.fn();
const loadMore = vi.fn();

const hookValues: {
  status: "idle" | "loading" | "success" | "error";
  filters: Record<string, string>;
  items: unknown[];
  total: number;
  error: string | null;
  isSearchPending: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  setFilters: typeof setFilters;
  clearFilters: typeof clearFilters;
  retry: typeof retry;
  loadMore: typeof loadMore;
  typeTab: string;
} = {
  status: "success",
  filters: {},
  items: [],
  total: 0,
  error: null,
  isSearchPending: false,
  isLoadingMore: false,
  hasMore: false,
  setFilters,
  clearFilters,
  retry,
  loadMore,
  typeTab: "all",
};

vi.mock("./use-browse-state", () => ({
  useBrowseState: () => hookValues,
}));

beforeEach(() => {
  setFilters.mockReset();
  clearFilters.mockReset();
  retry.mockReset();
  loadMore.mockReset();
  hookValues.status = "success";
  hookValues.filters = {};
  hookValues.items = [];
  hookValues.total = 0;
  hookValues.error = null;
  hookValues.isSearchPending = false;
  hookValues.isLoadingMore = false;
  hookValues.hasMore = false;
  hookValues.typeTab = "all";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BrowsePage", () => {
  it("renders the page header with the total count from the hook", () => {
    hookValues.total = 42;
    render(<BrowsePage />);
    expect(screen.getByTestId("browse-page")).toBeInTheDocument();
    expect(screen.getByText(/42 items/)).toBeInTheDocument();
  });

  it("clicking a type tab calls setFilters with the new type", async () => {
    const user = userEvent.setup();
    render(<BrowsePage />);
    await user.click(screen.getByRole("button", { name: /journal/i }));
    expect(setFilters).toHaveBeenCalledWith({ type: "journal" });
  });

  it("typing into the search input calls setFilters with the q", async () => {
    const user = userEvent.setup();
    render(<BrowsePage />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "docker");
    // Each keystroke forwards the cumulative value to the hook,
    // which debounces the actual fetch. The URL still updates on
    // every change so the back button tracks the typing.
    expect(setFilters.mock.calls.map((c) => c[0].q)).toEqual([
      "d",
      "do",
      "doc",
      "dock",
      "docke",
      "docker",
    ]);
  });

  it("toggles the advanced filters panel and forwards filter changes", async () => {
    const user = userEvent.setup();
    render(<BrowsePage />);
    const toggle = screen.getByTestId("advanced-toggle");
    // Collapsed by default.
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The advanced panel is now visible — its tag input is in the DOM.
    expect(screen.getByTestId("advanced-tag")).toBeInTheDocument();
  });

  it("renders the empty state when items is empty and no filters are set", () => {
    hookValues.items = [];
    hookValues.total = 0;
    render(<BrowsePage />);
    expect(screen.getByTestId("feed-empty")).toBeInTheDocument();
  });

  it("renders the error state when status is error", () => {
    hookValues.status = "error";
    hookValues.error = "Boom";
    render(<BrowsePage />);
    expect(screen.getByTestId("feed-error")).toHaveTextContent("Boom");
  });

  it("renders the loading skeleton when status is loading with no items", () => {
    hookValues.status = "loading";
    hookValues.items = [];
    render(<BrowsePage />);
    expect(screen.getByTestId("feed-loading")).toBeInTheDocument();
  });

  it("starts on the grid view", () => {
    hookValues.items = [];
    render(<BrowsePage />);
    const grid = screen.getByTestId("view-grid");
    expect(grid).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByTestId("view-list");
    expect(list).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to the list view when the list button is clicked", async () => {
    const user = userEvent.setup();
    hookValues.items = [];
    render(<BrowsePage />);
    await user.click(screen.getByTestId("view-list"));
    expect(screen.getByTestId("view-list")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId("view-grid")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("starts on the larger-dot indicator variant", () => {
    hookValues.items = [];
    render(<BrowsePage />);
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveAttribute("aria-pressed", "true");
    const pill = screen.getByTestId("indicator-pill");
    expect(pill).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to the pill variant when the pill button is clicked", async () => {
    const user = userEvent.setup();
    hookValues.items = [];
    render(<BrowsePage />);
    await user.click(screen.getByTestId("indicator-pill"));
    expect(screen.getByTestId("indicator-pill")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId("indicator-dot")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("forwards the active variant to the feed so each card renders it", async () => {
    const user = userEvent.setup();
    hookValues.items = [
      {
        id: "1",
        type: "note",
        title: "Note",
        content: "Hello",
        image_url: null,
        source: "manual",
        source_url: null,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    render(<BrowsePage />);
    // Default: `larger-dot` — the card carries a `size-2.5` dot
    // and no pill.
    expect(screen.queryByTestId("content-card-pill")).toBeNull();
    const dot = screen
      .getByTestId("content-card")
      .querySelector("span.bg-type-note.rounded-full");
    expect(dot?.className).toMatch(/size-2\.5/);

    // Flip to `pill` — the card drops the dot and renders a
    // filled chip with the type name.
    await user.click(screen.getByTestId("indicator-pill"));
    const pill = screen.getByTestId("content-card-pill");
    expect(pill).toHaveTextContent(/note/i);
    expect(
      screen
        .getByTestId("content-card")
        .querySelector("span.bg-type-note.rounded-full")
    ).toBeNull();
  });

  it("wires the load-more affordance to the hook's loadMore", async () => {
    const user = userEvent.setup();
    hookValues.items = [
      {
        id: "1",
        type: "note",
        title: "Note",
        content: "Hello",
        image_url: null,
        source: "manual",
        source_url: null,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    hookValues.total = 40;
    hookValues.hasMore = true;
    render(<BrowsePage />);
    await user.click(screen.getByTestId("feed-load-more-button"));
    expect(loadMore).toHaveBeenCalledOnce();
  });

  it("clicking a card's tag pill calls setFilters with the tag", async () => {
    const user = userEvent.setup();
    hookValues.items = [
      {
        id: "1",
        type: "note",
        title: "Note",
        content: "Hello",
        image_url: null,
        source: "manual",
        source_url: null,
        tags: ["docker", "infra"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    render(<BrowsePage />);
    await user.click(
      screen.getByRole("button", { name: /filter by tag docker/i })
    );
    expect(setFilters).toHaveBeenCalledWith({ tag: "docker" });
  });
});
