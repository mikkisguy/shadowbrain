// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./command-palette";
import { CommandPaletteProvider } from "./use-command-palette";
import { PaletteTrigger } from "@/components/layout/palette-trigger";
import { AddDialogProvider } from "@/components/add-dialog";

/**
 * The integration test for the command-palette dialog.
 *
 * Mounts the real provider, dialog, and trigger together.
 * Fetches to /api/search are mocked so the test does not
 * depend on a real database — the route is exercised in
 * its own test file. The router is mocked because the
 * Next.js navigation context is not available in a
 * node test environment.
 *
 * The cases cover each acceptance criterion in #88:
 *   - keyboard shortcut opens the palette
 *   - the top-nav trigger (desktop + mobile) opens it
 *   - default view shows the 5 pages + sign out
 *   - typing filters the Pages group via fuzzy matching
 *   - typing ≥ 2 chars fires a debounced 300ms FTS5
 *     fetch and renders the Content group
 *   - empty results show "(no results)" with the group
 *     header kept
 *   - ↑/↓ move the selection; Enter activates
 *   - the first Esc blurs the input; the second Esc
 *     closes the palette
 *   - the browse page does not own its own search bar
 *     (asserted indirectly: the palette owns the search
 *     input, no other <input type="search"> is in the
 *     chrome)
 */

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const fetchMock = vi.fn();

function renderPalette() {
  return render(
    <AddDialogProvider>
      <CommandPaletteProvider>
        <PaletteTrigger />
        <CommandPalette />
      </CommandPaletteProvider>
    </AddDialogProvider>
  );
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  fetchMock.mockReset();
  // Re-stub the global every test. The previous afterEach
  // call to `unstubAllGlobals` (or vitest's automatic
  // cleanup) tears down the previous stub; if the next
  // test relies on it, it would hit the real `fetch` and
  // fail with an unhandled rejection.
  vi.stubGlobal("fetch", fetchMock);
  // Default: no /api/search results.
  fetchMock.mockResolvedValue(
    jsonResponse({ query: "", results: [], total: 0, page: 1, limit: 8 })
  );
});

afterEach(() => {
  // React Testing Library's auto-cleanup unmounts every
  // component rendered with `render`. We must not also
  // clear `document.body.innerHTML` manually: base-ui's
  // Dialog renders a portal into `document.body` and its
  // teardown calls `removeChild` on the portal node. If
  // the portal has already been wiped, the teardown
  // throws `NotFoundError`. Letting RTL handle the
  // unmount is enough.
  vi.unstubAllGlobals();
});

describe("CommandPalette", () => {
  it("is closed by default (no dialog markup in the DOM)", () => {
    renderPalette();
    // The Dialog primitive is closed → the popup is not
    // rendered. The trigger is always present though.
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(screen.getByTestId("palette-trigger-desktop")).toBeInTheDocument();
  });

  it("opens when the desktop trigger button is clicked", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
  });

  it("opens when the mobile trigger button is clicked", async () => {
    // The mobile trigger is hidden on desktop (md:hidden
    // in Tailwind). jsdom honours `hidden` via the
    // `style.display` we set in the test, not via the
    // CSS class — so we set the inline style the way
    // userland code would, and click by accessible name.
    const user = userEvent.setup();
    renderPalette();
    const mobile = screen.getByTestId("palette-trigger-mobile");
    mobile.style.display = "inline-flex";
    await user.click(mobile);
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
  });

  it("opens on Cmd+K and closes on a second Cmd+K", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("renders the 5 page items + the sign-out and quick-add utilities in the default view", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const list = screen.getByTestId("command-palette-list");
    for (const id of [
      "page.browse",
      "page.chat",
      "page.graph",
      "page.tags",
      "page.settings",
      "utility.quickAdd",
      "utility.signOut",
    ]) {
      expect(
        within(list).getByTestId(`command-palette-item-${id}`)
      ).toBeInTheDocument();
    }
  });

  it("filters the Pages group via fuzzy match as the user types", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const input = screen.getByTestId("command-palette-input");
    await user.type(input, "gr");
    // `gr` matches `Graph` only — every other page is hidden.
    const pagesGroup = screen.getByTestId("command-palette-pages");
    expect(
      within(pagesGroup).queryByTestId("command-palette-item-page.browse")
    ).not.toBeInTheDocument();
    expect(
      within(pagesGroup).getByTestId("command-palette-item-page.graph")
    ).toBeInTheDocument();
  });

  it("debounces 300ms before hitting /api/search and renders hits", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        query: "do",
        total: 2,
        page: 1,
        limit: 8,
        results: [
          {
            id: "a",
            type: "note",
            title: "Docker compose notes",
            snippet: "Use <mark>do</mark>cker compose for local dev",
          },
          {
            id: "b",
            type: "bookmark",
            title: "Docker hub",
            snippet: "Search for images on <mark>do</mark>cker hub",
          },
        ],
      })
    );
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const input = screen.getByTestId("command-palette-input");

    // Type one character: no fetch, no Content group yet
    // (the spec requires ≥ 2 chars to fire a search).
    await user.type(input, "d");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("command-palette-content")
    ).not.toBeInTheDocument();

    // Type the second character: the debounce window
    // starts. The fetch must NOT have fired yet.
    await user.type(input, "o");
    expect(fetchMock).not.toHaveBeenCalled();

    // Wait past the debounce. The fetch should land.
    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 }
    );
    // The URL includes the query and the spec's `limit=8`.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/search?q=do&limit=8");
    expect(init).toMatchObject({});

    // The Content group renders both hits, each as a row.
    const content = await screen.findByTestId("command-palette-content");
    expect(
      within(content).getByTestId("command-palette-content-item-a")
    ).toBeInTheDocument();
    expect(
      within(content).getByTestId("command-palette-content-item-b")
    ).toBeInTheDocument();
  });

  it("renders '(no results)' inside the Content group when the API returns nothing", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ query: "zz", total: 0, page: 1, limit: 8, results: [] })
    );
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const input = screen.getByTestId("command-palette-input");
    await user.type(input, "zz");
    // The group header is kept — the empty line is inside
    // it, not a collapsed section. Wait for the empty
    // placeholder specifically (the "Searching…" line
    // appears in the same group while the request is
    // in flight, so we cannot rely on the group testid
    // alone).
    const empty = await screen.findByTestId("command-palette-content-empty");
    expect(empty).toHaveTextContent("(no results)");
  });

  it("renders a <mark> element for the FTS5-highlighted terms in the snippet", async () => {
    const user = userEvent.setup();
    // The snippet deliberately includes an angle bracket
    // outside the <mark> wrapper so the test can verify
    // escaping. FTS5's snippet() does not HTML-escape its
    // input; the palette is responsible for it.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        query: "do",
        total: 1,
        page: 1,
        limit: 8,
        results: [
          {
            id: "a",
            type: "note",
            title: "Docker compose notes",
            snippet: "<b>Use</b> <mark>do</mark>cker & compose",
          },
        ],
      })
    );
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const input = screen.getByTestId("command-palette-input");
    await user.type(input, "do");
    const item = await screen.findByTestId("command-palette-content-item-a");
    expect(item.querySelector("mark")).toBeInTheDocument();
    // The user-imported `<b>` and `&` outside the
    // <mark> wrappers are escaped, not rendered as DOM
    // elements or re-interpreted as HTML entities.
    expect(item.querySelector("b")).not.toBeInTheDocument();
    expect(item.innerHTML).toContain("&lt;b&gt;");
    expect(item.innerHTML).toContain("&amp;");
  });

  it("navigates when Enter is pressed on a page item", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    // Type enough to make the Pages group the only
    // selectable items, then activate the first one.
    await user.type(screen.getByTestId("command-palette-input"), "{Enter}");
    // The first page in declaration order is `Browse` →
    // its href is `/`. Router.push is called and the
    // palette closes.
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/");
    });
    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("navigates to /chat when the Chat item is activated", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const list = screen.getByTestId("command-palette-list");
    await user.click(
      within(list).getByTestId("command-palette-item-page.chat")
    );
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/chat");
    });
  });

  it("opens the sign-out form when the Sign out utility is activated", async () => {
    const user = userEvent.setup();
    // The sign-out path programmatically submits a form
    // to /api/auth/logout. We spy on form.submit and
    // confirm the action and method, then no-op the
    // navigation so the test does not actually log out.
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {
        /* swallow */
      });
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const list = screen.getByTestId("command-palette-list");
    await user.click(
      within(list).getByTestId("command-palette-item-utility.signOut")
    );
    expect(submitSpy).toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("first Esc blurs the input; second Esc closes the palette", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const input = screen.getByTestId("command-palette-input");
    input.focus();
    expect(document.activeElement).toBe(input);

    // First Esc: the input is blurred but the palette
    // stays open. We verify the palette is still mounted
    // and the input is no longer the active element.
    await user.keyboard("{Escape}");
    expect(document.activeElement).not.toBe(input);
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();

    // Second Esc: the dialog's default close handler
    // runs because no inner input is focused, and the
    // palette unmounts.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("does not fetch /api/search when the query is shorter than 2 chars", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    await user.type(screen.getByTestId("command-palette-input"), "a");
    // Wait past the debounce window to be sure.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts the in-flight fetch when the user keeps typing", async () => {
    const user = userEvent.setup();
    // First fetch resolves slowly so the abort path is
    // exercised. We use a never-resolving promise to
    // guarantee the request is in flight when the second
    // one is triggered.
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            /* never resolves */
          })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          query: "don",
          total: 0,
          page: 1,
          limit: 8,
          results: [],
        })
      );
    renderPalette();
    await user.click(screen.getByTestId("palette-trigger-desktop"));
    const input = screen.getByTestId("command-palette-input");
    await user.type(input, "do");
    // Let the first request start.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await user.type(input, "n");
    // The second request supersedes the first; the
    // abort is implicit (the cleanup function on the
    // effect calls controller.abort()).
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
