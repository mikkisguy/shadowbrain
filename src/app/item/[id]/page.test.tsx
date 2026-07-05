// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ItemDetailPage from "./page";

/**
 * Wrap a rendered element in a QueryClientProvider so components that
 * use TanStack Query (e.g. ItemEditor's delete mutation) have a client.
 */
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

const mocks = vi.hoisted(() => ({
  findWithRelations: vi.fn(),
  getDb: vi.fn(() => ({})),
}));

const coverMocks = vi.hoisted(() => ({
  findCoverImagesBySourceIds: vi.fn(() => ({})),
}));

const router = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/db/index", () => ({
  getDb: mocks.getDb,
  contentItems: {
    findWithRelations: mocks.findWithRelations,
  },
  contentLinks: {
    findCoverImagesBySourceIds: coverMocks.findCoverImagesBySourceIds,
  },
}));

// BackButton (a client component on the page) calls `useRouter`.
// Shared spies so click-behaviour tests can assert back()/push().
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/item/1",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  mocks.findWithRelations.mockReset();
  mocks.getDb.mockClear();
  // Reset and re-establish the default (no cover) so a test that sets
  // a cover cannot leak into the next.
  coverMocks.findCoverImagesBySourceIds.mockReset();
  coverMocks.findCoverImagesBySourceIds.mockReturnValue({});
  router.back.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
  sessionStorage.clear();
});

type MockLinks = {
  outbound?: Array<{
    id: string;
    link_type: string;
    target: { id: string; title: string | null; type: string };
  }>;
  inbound?: Array<{
    id: string;
    link_type: string;
    source: { id: string; title: string | null; type: string };
  }>;
};

function mockItem(
  type: string,
  metadata: string | null,
  content = "content",
  links: MockLinks = {}
) {
  mocks.findWithRelations.mockReturnValue({
    item: {
      id: "1",
      type,
      title: `${type} item`,
      content,
      image_path: null,
      source: "manual",
      source_url: null,
      metadata,
      is_private: 0,
      is_hidden: 0,
      created_at: "2026-04-12T15:30:45.000Z",
      updated_at: "2026-04-12T16:45:12.000Z",
    },
    tags: [],
    links: {
      outbound: links.outbound ?? [],
      inbound: links.inbound ?? [],
    },
  });
}

/**
 * Override `window.matchMedia` to report desktop (≥ 1024 px) so the
 * inline aside renders and the sidebar content is queryable in tests
 * that don't exercise the mobile sheet.
 */
function mockDesktopViewport() {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string): MediaQueryList =>
      ({
        matches: query === "(min-width: 1024px)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  );
}

describe("ItemDetailPage metadata rendering (issue #103)", () => {
  it("renders person metadata fields", async () => {
    mockItem(
      "person",
      JSON.stringify({
        email: "jane@example.com",
        social_links: ["https://github.com/jane", "https://x.com/jane"],
        phone_number: "+1 555 0100",
        role: "Senior Engineer",
      })
    );

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByLabelText("Metadata")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Social links")).toBeInTheDocument();
    expect(
      screen.getByText("https://github.com/jane, https://x.com/jane")
    ).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
  });

  it("renders project metadata fields", async () => {
    mockItem(
      "project",
      JSON.stringify({
        status: "active",
        repo: "https://github.com/example/branchforge",
        started: "2026-01-01T09:00:00.000Z",
        goal_end_date: "2026-12-31T18:00:00.000Z",
      })
    );

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByText("Goal end date")).toBeInTheDocument();
    expect(screen.getByText("Dec 31, 2026, 6:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2026, 9:00 AM")).toBeInTheDocument();
  });

  it("renders event start and end timestamps", async () => {
    mockItem(
      "event",
      JSON.stringify({
        start_date: "2026-04-12T09:30:00.000Z",
        end_date: "2026-04-12T11:15:00.000Z",
        duration: "1h 45m",
      })
    );

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Apr 12, 2026, 9:30 AM")).toBeInTheDocument();
    expect(screen.getByText("End")).toBeInTheDocument();
    expect(screen.getByText("Apr 12, 2026, 11:15 AM")).toBeInTheDocument();
  });

  it("omits dream lucidity", async () => {
    mockItem(
      "dream",
      JSON.stringify({
        mood: "surreal",
      })
    );

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByText("Mood")).toBeInTheDocument();
    expect(screen.queryByText("Lucidity")).not.toBeInTheDocument();
  });
});

describe("ItemDetailPage foundation (issue #25)", () => {
  it("renders a colored type badge with the type label", async () => {
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const badge = screen.getByTestId("item-type-badge");
    expect(badge).toHaveTextContent("Note");
    // The badge background is the note type token (--type-note → green).
    expect(badge.className).toContain("bg-type-note");
  });

  it("falls back to the raw token for an unknown type", async () => {
    mockItem("not-a-real-type", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const badge = screen.getByTestId("item-type-badge");
    // Unknown types keep the raw label and the raw (neutral) token.
    expect(badge).toHaveTextContent("not-a-real-type");
    expect(badge.className).toContain("bg-type-raw");
  });

  it("renders a visible back button", async () => {
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByTestId("item-back-button")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("navigates back via browser history when history exists", async () => {
    const user = userEvent.setup();
    // `history.length > 1` means there is a page to go back to.
    const lengthSpy = vi
      .spyOn(window.history, "length", "get")
      .mockReturnValue(2);
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );
    await user.click(screen.getByTestId("item-back-button"));

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
    lengthSpy.mockRestore();
  });

  it("falls back to Browse when there is no browser history", async () => {
    const user = userEvent.setup();
    // A fresh tab / direct deep link has no history to return to.
    const lengthSpy = vi
      .spyOn(window.history, "length", "get")
      .mockReturnValue(1);
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );
    await user.click(screen.getByTestId("item-back-button"));

    expect(router.push).toHaveBeenCalledWith("/");
    expect(router.back).not.toHaveBeenCalled();
    lengthSpy.mockRestore();
  });

  it("renders markdown content (headings, inline code, lists)", async () => {
    mockItem(
      "note",
      null,
      "# Docker networking\n\nBridge is the **default**. Use `docker network ls`.\n\n- bridge\n- host"
    );

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    // Markdown h1 renders as a heading inside the content area.
    expect(screen.getByText("Docker networking")).toBeInTheDocument();
    // Inline code renders as a <code> element.
    expect(screen.getByText("docker network ls").tagName).toBe("CODE");
    // Bold text is present.
    expect(screen.getByText("default")).toBeInTheDocument();
    // List items render.
    expect(screen.getByText("bridge")).toBeInTheDocument();
    expect(screen.getByText("host")).toBeInTheDocument();
  });

  it("renders fenced code blocks", async () => {
    mockItem("note", null, "```js\nconst x = 1;\nconsole.log(x);\n```");

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByText(/const x = 1/)).toBeInTheDocument();
    expect(document.querySelector("pre")).not.toBeNull();
  });

  it("opens external links in a new tab with safe rel", async () => {
    mockItem("bookmark", null, "Read [the docs](https://example.com/docs).");

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const link = screen.getByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("href", "https://example.com/docs");
  });

  it("keeps relative links in-tab (no target=_blank)", async () => {
    mockItem("note", null, "See [section](#section).");

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const link = screen.getByRole("link", { name: "section" });
    expect(link).not.toHaveAttribute("target");
  });
});

describe("ItemDetailPage links sidebar (issue #26)", () => {
  it("renders empty states when there are no links or backlinks", async () => {
    const desktopSpy = mockDesktopViewport();
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByRole("heading", { name: "Links" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Backlinks" })
    ).toBeInTheDocument();
    expect(screen.getByText("No outbound links yet.")).toBeInTheDocument();
    expect(screen.getByText("No backlinks yet.")).toBeInTheDocument();

    desktopSpy.mockRestore();
  });

  it("renders outbound links with title, link type, and a link to the item", async () => {
    const desktopSpy = mockDesktopViewport();
    mockItem("note", null, "content", {
      outbound: [
        {
          id: "l1",
          link_type: "depends-on",
          target: { id: "42", title: "Linked project", type: "project" },
        },
      ],
    });

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const link = screen.getByRole("link", { name: /Linked project/ });
    expect(link).toHaveAttribute("href", "/item/42");
    // kebab-case link type is shown as spaced words.
    expect(screen.getByText("depends on")).toBeInTheDocument();

    desktopSpy.mockRestore();
  });

  it("renders backlinks pointing at the source item", async () => {
    const desktopSpy = mockDesktopViewport();
    mockItem("note", null, "content", {
      inbound: [
        {
          id: "l2",
          link_type: "references",
          source: { id: "7", title: "Referring note", type: "note" },
        },
      ],
    });

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const link = screen.getByRole("link", { name: /Referring note/ });
    expect(link).toHaveAttribute("href", "/item/7");

    desktopSpy.mockRestore();
  });

  it("falls back to 'Untitled' for a linked item with no title", async () => {
    const desktopSpy = mockDesktopViewport();
    mockItem("note", null, "content", {
      outbound: [
        {
          id: "l3",
          link_type: "related-to",
          target: { id: "9", title: null, type: "note" },
        },
      ],
    });

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.getByText("Untitled")).toBeInTheDocument();

    desktopSpy.mockRestore();
  });

  it("opens the mobile sheet on toggle and closes it", async () => {
    const user = userEvent.setup();
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    // matchMedia stub reports mobile → no inline aside rendered.
    expect(screen.queryByTestId("item-sidebar")).not.toBeInTheDocument();

    const toggle = screen.getByTestId("sidebar-toggle");
    expect(toggle).toHaveTextContent("Show links");
    expect(toggle).toHaveAttribute("aria-haspopup", "dialog");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Clicking the toggle on mobile opens the sheet.
    await user.click(toggle);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // The sidebar content appears inside the sheet.
    expect(
      within(dialog).getByTestId("item-sidebar-content")
    ).toBeInTheDocument();

    // Closing the sheet via the close button hides the content.
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(
      screen.queryByTestId("item-sidebar-content")
    ).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles the inline sidebar on desktop", async () => {
    const user = userEvent.setup();
    const desktopSpy = mockDesktopViewport();
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const toggle = screen.getByTestId("sidebar-toggle");
    const sidebar = screen.getByTestId("item-sidebar");

    // Desktop: sidebar visible by default after hydration.
    expect(sidebar.className).not.toContain("hidden");
    expect(toggle).toHaveTextContent("Hide links");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);
    expect(sidebar.className).toContain("hidden");
    expect(toggle).toHaveTextContent("Show links");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(sidebar.className).not.toContain("hidden");
    expect(toggle).toHaveTextContent("Hide links");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    desktopSpy.mockRestore();
  });

  it("persists the desktop inline state to sessionStorage", async () => {
    const user = userEvent.setup();
    const desktopSpy = mockDesktopViewport();
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    // Desktop default is open; toggle it closed.
    await user.click(screen.getByTestId("sidebar-toggle"));
    expect(sessionStorage.getItem("item.sidebarOpen")).toBe("false");

    desktopSpy.mockRestore();
  });
});

describe("ItemDetailPage cover background", () => {
  it("renders a fading cover background from the first linked image", async () => {
    mockItem("journal", null);
    coverMocks.findCoverImagesBySourceIds.mockReturnValue({
      "1": "2026-05/abc.webp",
    });

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    const bg = screen.getByTestId("item-cover-background");
    const img = bg.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/images/2026-05/abc.webp");
  });

  it("renders no cover background when there is no linked image", async () => {
    mockItem("note", null);

    renderWithQuery(
      await ItemDetailPage({ params: Promise.resolve({ id: "1" }) })
    );

    expect(screen.queryByTestId("item-cover-background")).toBeNull();
  });
});
