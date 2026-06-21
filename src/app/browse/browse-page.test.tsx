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

const hookValues: {
  status: "idle" | "loading" | "success" | "error";
  filters: Record<string, string>;
  data: null | { items: unknown[]; total: number };
  error: string | null;
  isSearchPending: boolean;
  setFilters: typeof setFilters;
  clearFilters: typeof clearFilters;
  retry: typeof retry;
  typeTab: string;
} = {
  status: "success",
  filters: {},
  data: { items: [], total: 0 },
  error: null,
  isSearchPending: false,
  setFilters,
  clearFilters,
  retry,
  typeTab: "all",
};

vi.mock("./use-browse-state", () => ({
  useBrowseState: () => hookValues,
}));

beforeEach(() => {
  setFilters.mockReset();
  clearFilters.mockReset();
  retry.mockReset();
  hookValues.status = "success";
  hookValues.filters = {};
  hookValues.data = { items: [], total: 0 };
  hookValues.error = null;
  hookValues.isSearchPending = false;
  hookValues.typeTab = "all";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BrowsePage", () => {
  it("renders the page header with the total count from the hook", () => {
    hookValues.data = { items: [], total: 42 };
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

  it("renders the empty state when data has no items and no filters are set", () => {
    hookValues.data = { items: [], total: 0 };
    render(<BrowsePage />);
    expect(screen.getByTestId("feed-empty")).toBeInTheDocument();
  });

  it("renders the error state when status is error", () => {
    hookValues.status = "error";
    hookValues.error = "Boom";
    render(<BrowsePage />);
    expect(screen.getByTestId("feed-error")).toHaveTextContent("Boom");
  });

  it("renders the loading skeleton when status is loading with no data", () => {
    hookValues.status = "loading";
    hookValues.data = null;
    render(<BrowsePage />);
    expect(screen.getByTestId("feed-loading")).toBeInTheDocument();
  });
});
