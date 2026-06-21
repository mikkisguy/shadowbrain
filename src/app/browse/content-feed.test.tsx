// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ContentFeed } from "./content-feed";
import type { BrowseItem } from "./types";

/**
 * Content-feed tests.
 *
 * The feed has four visual states: loading, error, empty, and
 * success. The component is purely presentational — its only
 * "input" is the status enum plus the items array. The tests
 * pin the four states and the retry hook-up.
 */

const item: BrowseItem = {
  id: "1",
  type: "note",
  title: "Note",
  content: "Hello",
  source: "manual",
  source_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("ContentFeed", () => {
  it("renders a loading skeleton when status is loading and no items", () => {
    render(
      <ContentFeed
        items={null}
        status="loading"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
      />
    );
    expect(screen.getByTestId("feed-loading")).toBeInTheDocument();
  });

  it("renders an error card and wires up the retry button", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <ContentFeed
        items={null}
        status="error"
        error="Boom"
        onRetry={onRetry}
        hasActiveFilters={false}
      />
    );
    expect(screen.getByTestId("feed-error")).toHaveTextContent("Boom");
    await user.click(screen.getByTestId("feed-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the empty state with filter-aware copy", () => {
    const { rerender } = render(
      <ContentFeed
        items={[]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
      />
    );
    expect(screen.getByTestId("feed-empty")).toHaveTextContent(
      /second brain is empty/i
    );
    rerender(
      <ContentFeed
        items={[]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters
      />
    );
    expect(screen.getByTestId("feed-empty")).toHaveTextContent(
      /no items match these filters/i
    );
  });

  it("renders the items as a feed list", () => {
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
      />
    );
    const list = screen.getByTestId("feed");
    expect(list).toBeInTheDocument();
    expect(list.querySelectorAll('[data-testid="content-card"]')).toHaveLength(
      1
    );
  });
});
