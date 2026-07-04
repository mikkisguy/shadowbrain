// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock react-virtuoso to render all items (no virtualization in tests)
vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
    components,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
    components?: {
      List?: React.ComponentType<{
        children?: React.ReactNode;
        style?: React.CSSProperties;
        [key: string]: unknown;
      }>;
    };
  }) => {
    const List = components?.List || "div";
    return (
      <List>
        {data.map((item, index) => (
          <div key={index}>{itemContent(index, item)}</div>
        ))}
      </List>
    );
  },
}));

import { ContentFeed } from "./content-feed";
import type { BrowseItem } from "./types";

/**
 * Content-feed tests.
 *
 * The feed has four visual states: loading, error, empty, and
 * success. The component is purely presentational — its only
 * "input" is the status enum plus the items array. The tests
 * pin the four states, the retry hook-up, and the
 * load-more affordance (sentinel + button + end-of-results).
 *
 * The view toggle (grid / list) is tested in browse-page.test.tsx
 * since the page owns that state. The feed only renders the
 * layout the page hands it.
 */

const item: BrowseItem = {
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
};

const defaultProps = {
  view: "grid" as const,
  isLoadingMore: false,
  hasMore: false,
  onLoadMore: () => undefined,
};

describe("ContentFeed", () => {
  beforeEach(() => {
    // jsdom does not implement IntersectionObserver. The feed
    // short-circuits the effect when the constructor is
    // missing, so we mock it for the load-more tests to verify
    // the observer setup does not throw.
    class MockIntersectionObserver {
      readonly root: Element | null = null;
      readonly rootMargin: string = "0px";
      readonly thresholds: ReadonlyArray<number> = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).IntersectionObserver;
  });

  it("renders a loading skeleton when status is loading and no items", () => {
    render(
      <ContentFeed
        items={null}
        status="loading"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
      />
    );
    // VirtuosoGrid renders items; we verify the card is present
    expect(screen.getByTestId("content-card")).toBeInTheDocument();
  });

  it("renders the list view when view is 'list'", () => {
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
        view="list"
      />
    );
    // List view uses a flex column container; verify the card renders
    expect(screen.getByTestId("content-card")).toBeInTheDocument();
  });

  it("renders the load-more affordance when hasMore is true", () => {
    const onLoadMore = vi.fn();
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
        hasMore
        onLoadMore={onLoadMore}
      />
    );
    expect(screen.getByTestId("feed-load-more-button")).toBeInTheDocument();
  });

  it("renders the 'loading more' indicator while isLoadingMore is true", () => {
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
        hasMore
        isLoadingMore
      />
    );
    expect(screen.getByText(/loading more/i)).toBeInTheDocument();
  });

  it("renders the end-of-results line when hasMore is false and items are present", () => {
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
        hasMore={false}
      />
    );
    expect(screen.getByTestId("feed-end")).toBeInTheDocument();
  });

  it("calls onLoadMore when the load-more button is clicked", async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
        hasMore
        onLoadMore={onLoadMore}
      />
    );
    await user.click(screen.getByTestId("feed-load-more-button"));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("still shows the manual Load more button during search when hasMore", () => {
    // Infinite scroll is off, but manual pagination stays available so
    // search results are never cut off.
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
        hasMore
        infiniteScroll={false}
      />
    );
    expect(screen.getByTestId("feed-load-more-button")).toBeInTheDocument();
  });

  it("threads onTagClick through to each card's tag pill", async () => {
    const onTagClick = vi.fn();
    const user = userEvent.setup();
    const taggedItem: BrowseItem = { ...item, tags: ["docker"] };
    render(
      <ContentFeed
        items={[taggedItem]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
        onTagClick={onTagClick}
      />
    );
    await user.click(
      screen.getByRole("button", { name: /filter by tag docker/i })
    );
    expect(onTagClick).toHaveBeenCalledWith("docker");
  });

  it("renders a card link to /item/[id] for each item", () => {
    render(
      <ContentFeed
        items={[item]}
        status="success"
        error={null}
        onRetry={() => undefined}
        hasActiveFilters={false}
        {...defaultProps}
      />
    );
    const link = screen.getByRole("link", { name: /open note/i });
    expect(link).toHaveAttribute("href", "/item/1");
  });
});
