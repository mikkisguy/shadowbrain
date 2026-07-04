// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdvancedFilters } from "./advanced-filters";
import type { BrowseFilters } from "./types";

/** Wrap the component tree in a fresh QueryClientProvider per call. */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Advanced-filters tests.
 *
 * The panel renders a tag multi-select (chips + typeahead input), a
 * source dropdown, date-preset buttons, and a custom date range. Each
 * control commits its value to the parent via `onPatch` so the URL
 * stays the source of truth. The "Clear all" button is disabled until
 * at least one secondary filter is set.
 */

const empty: BrowseFilters = {};

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoUTC(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("AdvancedFilters", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tags: [] }),
      })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the tag input, source dropdown, date inputs, and presets", () => {
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={() => undefined}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByTestId("advanced-tag")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-source")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-start")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-end")).toBeInTheDocument();
    expect(screen.getByTestId("preset-7d")).toBeInTheDocument();
    expect(screen.getByTestId("preset-30d")).toBeInTheDocument();
  });

  it("renders existing tags as removable chips", () => {
    render(
      <AdvancedFilters
        filters={{ tag: "docker,kubernetes" }}
        onPatch={() => undefined}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText("docker")).toBeInTheDocument();
    expect(screen.getByText("kubernetes")).toBeInTheDocument();
    expect(screen.getByTestId("tag-remove-docker")).toBeInTheDocument();
  });

  it("adds a tag on Enter", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    const input = screen.getByTestId("advanced-tag");
    await user.type(input, "docker{Enter}");
    expect(onPatch).toHaveBeenCalledWith({ tag: "docker" });
  });

  it("appends a tag to an existing selection", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={{ tag: "docker" }}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    const input = screen.getByTestId("advanced-tag");
    await user.type(input, "kubernetes{Enter}");
    expect(onPatch).toHaveBeenCalledWith({ tag: "docker,kubernetes" });
  });

  it("does not add a duplicate tag (case-insensitive)", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={{ tag: "docker" }}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    const input = screen.getByTestId("advanced-tag");
    await user.type(input, "Docker{Enter}");
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("removes a tag via its chip button", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={{ tag: "docker,kubernetes" }}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    await user.click(screen.getByTestId("tag-remove-docker"));
    expect(onPatch).toHaveBeenCalledWith({ tag: "kubernetes" });
  });

  it("removes the last tag entirely (clears the filter)", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={{ tag: "docker" }}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    await user.click(screen.getByTestId("tag-remove-docker"));
    expect(onPatch).toHaveBeenCalledWith({ tag: undefined });
  });

  it("updates the source filter from the dropdown", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    // The base-ui Select is a custom dropdown (not a native <select>):
    // open the trigger, then click the option.
    await user.click(screen.getByTestId("advanced-source"));
    const item = await screen.findByRole("option", { name: "discord" });
    await user.click(item);
    expect(onPatch).toHaveBeenCalledWith({ source: "discord" });
  });

  it("clears the source filter when selecting the empty option", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={{ source: "discord" }}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    await user.click(screen.getByTestId("advanced-source"));
    const item = await screen.findByRole("option", { name: "All sources" });
    await user.click(item);
    expect(onPatch).toHaveBeenCalledWith({ source: undefined });
  });

  it("applies the 7-day preset to the date range", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    await user.click(screen.getByTestId("preset-7d"));
    expect(onPatch).toHaveBeenCalledWith({
      startDate: daysAgoUTC(7),
      endDate: todayUTC(),
    });
  });

  it("applies the 30-day preset to the date range", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    await user.click(screen.getByTestId("preset-30d"));
    expect(onPatch).toHaveBeenCalledWith({
      startDate: daysAgoUTC(30),
      endDate: todayUTC(),
    });
  });

  it("disables Clear all when no secondary filters are active", () => {
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={() => undefined}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByTestId("advanced-clear")).toBeDisabled();
  });

  it("enables Clear all when a secondary filter is active and wires up onClear", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={{ tag: "docker" }}
        onPatch={() => undefined}
        onClear={onClear}
      />,
      { wrapper: createWrapper() }
    );
    const button = screen.getByTestId("advanced-clear");
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("shows tag suggestions fetched from /api/tags", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tags: [{ name: "docker" }, { name: "docker-compose" }],
        }),
    } as Response);
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={() => undefined}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    const input = screen.getByTestId("advanced-tag");
    // Focus triggers the lazy fetch.
    await user.click(input);
    await user.type(input, "dock");
    expect(
      await screen.findByTestId("tag-suggestion-docker")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("tag-suggestion-docker-compose")
    ).toBeInTheDocument();
  });

  it("adds a tag by clicking a suggestion", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tags: [{ name: "docker" }] }),
    } as Response);
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={onPatch}
        onClear={() => undefined}
      />,
      { wrapper: createWrapper() }
    );
    const input = screen.getByTestId("advanced-tag");
    await user.click(input);
    await user.type(input, "dock");
    const suggestion = await screen.findByTestId("tag-suggestion-docker");
    await user.click(suggestion);
    expect(onPatch).toHaveBeenCalledWith({ tag: "docker" });
  });
});
