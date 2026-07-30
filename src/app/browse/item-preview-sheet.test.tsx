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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Wrap a rendered element in a QueryClientProvider so components that
 * use TanStack Query (e.g. delete mutation) have a client.
 */
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
  return {
    ...result,
    queryClient,
    rerender: (newUi: React.ReactElement) =>
      result.rerender(
        <QueryClientProvider client={queryClient}>{newUi}</QueryClientProvider>
      ),
  };
}

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
    if (!open) return null;
    return (
      <div data-testid="sheet-root">
        <div data-testid="sheet-content">{children}</div>
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

const markdownProps = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock("@/app/item/[id]/markdown-content", () => ({
  MarkdownContent: (props: Record<string, unknown>) => {
    markdownProps.current = props;
    return (
      <div
        data-testid="item-content"
        data-interactive={String(props.interactive)}
        data-item-id={String(props.itemId)}
        data-has-save-callback={String(
          typeof props.onContentSaved === "function"
        )}
      >
        {String(props.content)}
      </div>
    );
  },
}));

import { ItemPreviewSheet } from "./item-preview-sheet";

/* ------------------------------------------------------------------ */
/*  Fixture data                                                       */
/* ------------------------------------------------------------------ */

function createFixture(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const { item: itemOverrides, links: linksOverrides, ...rest } = overrides;

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
      ...(itemOverrides as Record<string, unknown> | undefined),
    },
    tags: [
      { id: "tag-1", name: "docker" },
      { id: "tag-2", name: "infra" },
    ],
    links: linksOverrides ?? {
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
    ...rest,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("ItemPreviewSheet", () => {
  const onClose = vi.fn();
  beforeEach(() => {
    onClose.mockReset();
    markdownProps.current = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders nothing when itemId is null", () => {
    const { container } = renderWithQuery(
      <ItemPreviewSheet itemId={null} onClose={onClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a loading skeleton while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>(() => {
        /* never resolves */
      })
    );
    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);
    expect(screen.getByTestId("sheet-loading")).toBeInTheDocument();
  });

  it("renders item detail after successful fetch", async () => {
    const fixture = createFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-type-badge")).toHaveTextContent("Note");
    });

    const titles = screen.getAllByText("Test Note");
    expect(titles.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("sheet-content-preview")).toHaveTextContent(
      "Hello **world**!"
    );
    expect(markdownProps.current).toMatchObject({
      interactive: true,
      itemId: "item-1",
    });
    expect(typeof markdownProps.current?.onContentSaved).toBe("function");
    expect(screen.getByText("#docker")).toBeInTheDocument();
    expect(screen.getByText("#infra")).toBeInTheDocument();
    expect(screen.getByText("Linked Item")).toBeInTheDocument();
    expect(screen.getByText("Backlink Item")).toBeInTheDocument();
    expect(
      screen.queryByTestId("sheet-workflow-status")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("view-grid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("view-kanban")).not.toBeInTheDocument();
    expect(screen.queryByTestId("view-timeline")).not.toBeInTheDocument();
  });

  it("keeps the saved markdown and revision in the sheet detail state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(createFixture()),
    } as Response);
    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => expect(markdownProps.current).not.toBeNull());
    const onContentSaved = markdownProps.current?.onContentSaved as (
      content: string,
      updatedAt: string
    ) => void;
    onContentSaved("- [x] committed", "2026-07-29T00:00:01.000Z");

    await waitFor(() =>
      expect(screen.getByTestId("sheet-content-preview")).toHaveTextContent(
        "- [x] committed"
      )
    );
    expect(markdownProps.current).toMatchObject({
      content: "- [x] committed",
      updatedAt: "2026-07-29T00:00:01.000Z",
    });
  });

  it("renders an 'open full page' button that links to the item detail page", async () => {
    const fixture = createFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

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

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

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

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-error")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Couldn't load this item right now/)
    ).toBeInTheDocument();
  });

  it("renders the retry button on error and refetches on click", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-error")).toBeInTheDocument();
    });

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

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("DevOps lead")).toBeInTheDocument();
    });
    expect(screen.getByText("sarah@example.com")).toBeInTheDocument();
  });

  it("shows the workflow status strip for task items", async () => {
    const fixture = createFixture({
      item: {
        type: "task",
        metadata: JSON.stringify({
          status: "in_progress",
          due_date: "2026-07-01T12:00:00.000Z",
        }),
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-workflow-status")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /in progress/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Jul 1, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/^Status$/)).not.toBeInTheDocument();
  });

  it("shows the workflow status strip for event items", async () => {
    const fixture = createFixture({
      item: {
        type: "event",
        metadata: JSON.stringify({
          status: "done",
          start_date: "2026-07-01T09:00:00.000Z",
        }),
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-workflow-status")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /done/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("patches merged metadata when workflow status changes", async () => {
    const user = userEvent.setup();
    const fixture = createFixture({
      item: {
        id: "task-1",
        type: "task",
        metadata: JSON.stringify({
          status: "todo",
          due_date: "2026-07-01T12:00:00.000Z",
        }),
      },
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(fixture),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...fixture,
            item: {
              ...(fixture.item as Record<string, unknown>),
              metadata: JSON.stringify({
                status: "in_progress",
                due_date: "2026-07-01T12:00:00.000Z",
              }),
            },
          }),
      } as Response);

    renderWithQuery(<ItemPreviewSheet itemId="task-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-workflow-status")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("sheet-workflow-status-in_progress"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/items/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            type: "task",
            metadata: {
              status: "in_progress",
              due_date: "2026-07-01T12:00:00.000Z",
            },
          }),
        })
      );
    });
  });

  it("renders a parent crumb from outbound happened_during links", async () => {
    const fixture = createFixture({
      item: {
        type: "task",
        metadata: JSON.stringify({ status: "todo" }),
      },
      links: {
        outbound: [
          {
            id: "link-parent",
            target: {
              id: "project-1",
              title: "Launch Project",
              type: "project",
            },
            link_type: "happened_during",
          },
        ],
        inbound: [],
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fixture),
    } as Response);

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-parent-crumb")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sheet-parent-crumb")).toHaveAttribute(
      "href",
      "/item/project-1"
    );
    expect(screen.getByTestId("sheet-parent-crumb")).toHaveTextContent(
      "Launch Project"
    );
  });

  it("scrolls image and metadata together for image items", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () =>
        createFixture({
          item: {
            type: "image",
            title: "Tall Portrait",
            content: "Portrait description",
            image_path: "/uploads/portrait.jpg",
          },
        }),
    } as Response);

    renderWithQuery(<ItemPreviewSheet itemId="item-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("sheet-type-badge")).toHaveTextContent("Image");
    });

    const scrollBody = screen.getByTestId("sheet-scroll-body");
    const image = screen.getByRole("img", { name: "Tall Portrait" });
    const linksHeading = screen.getByText("Links (1)");

    // Structural contract for unified tall-image scroll:
    // image + metadata share one overflow-y-auto flex child; links stay pinned.
    expect(scrollBody).toHaveClass("overflow-y-auto", "min-h-0", "flex-1");
    expect(scrollBody).toContainElement(image);
    expect(scrollBody).toContainElement(
      screen.getByRole("heading", { name: "Tall Portrait" })
    );
    expect(scrollBody).toContainElement(
      screen.getByText("Portrait description")
    );
    expect(scrollBody).not.toContainElement(linksHeading);
  });

  it("does not fetch when itemId changes from a value to null", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createFixture()),
    } as Response);

    const { rerender } = renderWithQuery(
      <ItemPreviewSheet itemId="item-1" onClose={onClose} />
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender(<ItemPreviewSheet itemId={null} onClose={onClose} />);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });
});
