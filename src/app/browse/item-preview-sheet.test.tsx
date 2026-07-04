// @vitest-environment jsdom

/**
 * Item-preview-sheet tests.
 *
 * The sheet is a client component that fetches item detail from the API
 * and renders it in a Base UI Dialog sheet. We mock `fetch` globally and
 * the Sheet components to avoid Base UI Dialog complexity in unit tests.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Sheet components to avoid Base UI Dialog complexity.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  }) => {
    // When open is false, render nothing (simulating the real Sheet's behaviour).
    if (!open) return null;
    return (
      <div data-testid="sheet-root">
        <div data-testid="sheet-content">{children}</div>
        {/* Simulate the close button calling onOpenChange(false) */}
        <button
          data-testid="mock-sheet-close"
          onClick={() => onOpenChange?.(false)}
        >
          Close
        </button>
      </div>
    );
  },
  SheetContent: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
    side?: string;
  }) => (
    <div data-testid="sheet-content-inner" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Mock MarkdownContent — it's well-tested elsewhere.
vi.mock("@/app/item/[id]/markdown-content", () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

import { ItemPreviewSheet } from "./item-preview-sheet";

/* ------------------------------------------------------------------ */
/*  Fixture data                                                       */
/* ------------------------------------------------------------------ */

function createFixture(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    item: {
      id: "item-1",
      type: "note",
      title: "Test Note",
      content: "Hello **world**!",
      image_path: null,
      source: "manual",
      source_url: null,
      metadata: null,
      created_at: "2026-06-21T12:00:00.000Z",
      updated_at: "2026-06-22T08:30:00.000Z",
      ...(overrides.item as Record<string, unknown>),
    },
    tags: [
      { id: "tag-1", name: "docker" },
      { id: "tag-2", name: "infra" },
    ],
    links: {
      outbound: [
        {
          id: "link-1",
          target: { id: "item-2", title: "Linked Item", type: "note" },
          link_type: "related-to",
        },
      ],
      inbound: [
        {
          id: "link-2",
          source: { id: "item-3", title: "Backlink Item", type: "journal" },
          link_type: "references",
        },
      ],
    },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("ItemPreviewSheet", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when itemId is null", () => {
    const { container } = render(
      <ItemPreviewSheet itemId={null} onClose={onClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a loading skeleton while fetching", () => {
    // Mock fetch to return a promise that never resolves during this render.
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>(() => {
        /* never resolves */
      })
    );
    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);
    expect(screen.getByTestId("sheet-loading")).toBeInTheDocument();
  });

  it("renders item detail after successful fetch", async () => {
    const fixture = createFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-type-badge")).toHaveTextContent("Note");
    });

    // Title — appears in the h2 and in the SheetTitle; use getAllByText
    // and assert at least one is the rendered h2.
    const titles = screen.getAllByText("Test Note");
    expect(titles.length).toBeGreaterThanOrEqual(1);
    // Markdown content (mocked)
    expect(screen.getByTestId("markdown-content")).toHaveTextContent(
      "Hello **world**!"
    );
    // Tags
    expect(screen.getByText("#docker")).toBeInTheDocument();
    expect(screen.getByText("#infra")).toBeInTheDocument();
    // Outbound link
    expect(screen.getByText("Linked Item")).toBeInTheDocument();
    // Inbound link
    expect(screen.getByText("Backlink Item")).toBeInTheDocument();
    // Dates
    expect(screen.getByText(/Jun 21, 2026/)).toBeInTheDocument();
    // Source
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("renders an 'open full page' button that links to the item detail page", async () => {
    const fixture = createFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-type-badge")).toHaveTextContent("Note");
    });

    const openFullPageButton = screen.getByRole("link", {
      name: /open full page/i,
    });
    expect(openFullPageButton).toBeInTheDocument();
    expect(openFullPageButton).toHaveAttribute("href", "/item/item-1");
  });

  it("calls onClose when the sheet is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(createFixture()),
    } as Response);

    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-type-badge")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("mock-sheet-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows error state on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );

    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-error")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Couldn't load this item right now/)
    ).toBeInTheDocument();
  });

  it("renders the retry button on error and refetches on click", async () => {
    const user = userEvent.setup();
    // First call fails
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );

    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-error")).toBeInTheDocument();
    });

    // Second call succeeds
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(createFixture()),
    } as Response);

    await user.click(screen.getByTestId("sheet-retry"));

    await waitFor(() => {
      expect(screen.getByTestId("sheet-type-badge")).toBeInTheDocument();
    });
  });

  it("renders metadata section for person items", async () => {
    const fixture = createFixture({
      item: {
        type: "person",
        metadata: JSON.stringify({
          role: "DevOps lead",
          email: "sarah@example.com",
        }),
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("DevOps lead")).toBeInTheDocument();
    });
    expect(screen.getByText("sarah@example.com")).toBeInTheDocument();
  });

  it("renders cover image when image_path is set on non-image type", async () => {
    const fixture = createFixture({
      item: {
        image_path: "notes/cover.webp",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    render(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      // The cover image has alt="" (presentational), so getByRole("img")
      // won't find it. Query via container for the src attribute instead.
      const img = document.querySelector<HTMLImageElement>(
        'img[src="/api/images/notes/cover.webp"]'
      );
      expect(img).not.toBeNull();
    });
  });

  it("does not fetch when itemId changes from a value to null", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createFixture()),
    } as Response);

    const { rerender } = render(
      <ItemPreviewSheet itemId="item-1" onClose={onClose} />
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // When itemId becomes null, the sheet closes — no new fetch.
    rerender(<ItemPreviewSheet itemId={null} onClose={onClose} />);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    fetchSpy.mockRestore();
  });
});
