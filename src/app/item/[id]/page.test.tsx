// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ItemDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  findWithRelations: vi.fn(),
  getDb: vi.fn(() => ({})),
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
  router.back.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByText("Mood")).toBeInTheDocument();
    expect(screen.queryByText("Lucidity")).not.toBeInTheDocument();
  });
});

describe("ItemDetailPage foundation (issue #25)", () => {
  it("renders a colored type badge with the type label", async () => {
    mockItem("note", null);

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    const badge = screen.getByTestId("item-type-badge");
    expect(badge).toHaveTextContent("Note");
    // The badge background is the note type token (--type-note → green).
    expect(badge.className).toContain("bg-type-note");
  });

  it("falls back to the raw token for an unknown type", async () => {
    mockItem("not-a-real-type", null);

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    const badge = screen.getByTestId("item-type-badge");
    // Unknown types keep the raw label and the raw (neutral) token.
    expect(badge).toHaveTextContent("not-a-real-type");
    expect(badge.className).toContain("bg-type-raw");
  });

  it("renders a visible back button", async () => {
    mockItem("note", null);

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));
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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));
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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

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

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByText(/const x = 1/)).toBeInTheDocument();
    expect(document.querySelector("pre")).not.toBeNull();
  });

  it("opens external links in a new tab with safe rel", async () => {
    mockItem("bookmark", null, "Read [the docs](https://example.com/docs).");

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    const link = screen.getByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("href", "https://example.com/docs");
  });

  it("keeps relative links in-tab (no target=_blank)", async () => {
    mockItem("note", null, "See [section](#section).");

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    const link = screen.getByRole("link", { name: "section" });
    expect(link).not.toHaveAttribute("target");
  });
});

describe("ItemDetailPage links sidebar (issue #26)", () => {
  it("renders empty states when there are no links or backlinks", async () => {
    mockItem("note", null);

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByRole("heading", { name: "Links" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Backlinks" })
    ).toBeInTheDocument();
    expect(screen.getByText("No outbound links yet.")).toBeInTheDocument();
    expect(screen.getByText("No backlinks yet.")).toBeInTheDocument();
  });

  it("renders outbound links with title, link type, and a link to the item", async () => {
    mockItem("note", null, "content", {
      outbound: [
        {
          id: "l1",
          link_type: "depends-on",
          target: { id: "42", title: "Linked project", type: "project" },
        },
      ],
    });

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    const link = screen.getByRole("link", { name: /Linked project/ });
    expect(link).toHaveAttribute("href", "/item/42");
    // kebab-case link type is shown as spaced words.
    expect(screen.getByText("depends on")).toBeInTheDocument();
  });

  it("renders backlinks pointing at the source item", async () => {
    mockItem("note", null, "content", {
      inbound: [
        {
          id: "l2",
          link_type: "references",
          source: { id: "7", title: "Referring note", type: "note" },
        },
      ],
    });

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    const link = screen.getByRole("link", { name: /Referring note/ });
    expect(link).toHaveAttribute("href", "/item/7");
  });

  it("falls back to 'Untitled' for a linked item with no title", async () => {
    mockItem("note", null, "content", {
      outbound: [
        {
          id: "l3",
          link_type: "related-to",
          target: { id: "9", title: null, type: "note" },
        },
      ],
    });

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("toggles the sidebar open and closed", async () => {
    const user = userEvent.setup();
    mockItem("note", null);

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    const toggle = screen.getByTestId("sidebar-toggle");
    const sidebar = screen.getByTestId("item-sidebar");

    // matchMedia stub reports "no match" (mobile) → closed by default.
    expect(sidebar.className).toContain("hidden");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(sidebar.className).not.toContain("hidden");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);
    expect(sidebar.className).toContain("hidden");
  });

  it("persists the open state to sessionStorage", async () => {
    const user = userEvent.setup();
    mockItem("note", null);

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    await user.click(screen.getByTestId("sidebar-toggle"));
    expect(sessionStorage.getItem("item.sidebarOpen")).toBe("true");
  });
});
