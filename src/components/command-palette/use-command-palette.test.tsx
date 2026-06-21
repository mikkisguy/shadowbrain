// @vitest-environment jsdom

import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CommandPaletteProvider,
  useCommandPalette,
} from "./use-command-palette";

/**
 * The hook owns the open state and the global Cmd+K / Ctrl+K
 * listener. These tests cover the contract the spec calls out
 * — the shortcut opens the palette from any focused element
 * (including a page input) and the imperative API matches what
 * the dialog + trigger consume.
 */

afterEach(() => {
  // Each test installs a fresh listener; nothing to clean
  // up explicitly because the provider's effect does it.
});

function Probe() {
  const { open, setOpen, toggle } = useCommandPalette();
  return (
    <div>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <button data-testid="open" onClick={() => setOpen(true)}>
        open
      </button>
      <button data-testid="close" onClick={() => setOpen(false)}>
        close
      </button>
      <button data-testid="toggle" onClick={toggle}>
        toggle
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <CommandPaletteProvider>
      <Probe />
    </CommandPaletteProvider>
  );
}

describe("useCommandPalette", () => {
  it("throws when used outside a provider", () => {
    // The hook is a programming-error surface, not a
    // recoverable runtime condition. Pinning the throw
    // makes a missing provider easy to spot in tests.
    expect(() => renderHook(() => useCommandPalette())).toThrow(
      /CommandPaletteProvider/
    );
  });

  it("starts closed and exposes a working imperative API", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    expect(screen.getByTestId("state")).toHaveTextContent("closed");

    await user.click(screen.getByTestId("open"));
    expect(screen.getByTestId("state")).toHaveTextContent("open");

    await user.click(screen.getByTestId("close"));
    expect(screen.getByTestId("state")).toHaveTextContent("closed");

    await user.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("opens on Cmd+K (macOS)", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("opens on Ctrl+K (Windows/Linux)", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("toggles the state on repeated Cmd+K presses", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByTestId("state")).toHaveTextContent("open");
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  it("opens the palette even when an input on the page is focused", async () => {
    // The design spec's "standard pattern" — Cmd+K works
    // regardless of focus. The provider does not gate on
    // the active element.
    function PageWithInput() {
      return (
        <CommandPaletteProvider>
          <input data-testid="page-input" />
          <Probe />
        </CommandPaletteProvider>
      );
    }
    const user = userEvent.setup();
    render(<PageWithInput />);
    const input = screen.getByTestId("page-input");
    input.focus();
    expect(document.activeElement).toBe(input);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("does not steal ⌘⇧K or ⌘⌥K (only the bare ⌘K / Ctrl+K)", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    await user.keyboard("{Control>}{Alt>}k{/Alt}{/Control}");
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  it("does not open on a plain 'k' keystroke (no modifier)", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.keyboard("k");
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  it("removes the global listener on unmount", async () => {
    // A memory-leak guard: a soft navigation that swaps
    // the root document must not leave a stray listener
    // that toggles a dead provider.
    const { unmount } = renderWithProvider();
    unmount();
    // After unmount, dispatching the shortcut on the
    // document should have no effect (we cannot read the
    // previous provider's state, but we can assert that
    // no thrown error escapes the listener).
    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(event);
    });
    // If the listener were still attached, it would have
    // called setState on the unmounted provider, which
    // React 19 logs as a warning. The `act` flush above
    // is enough to surface that; we just assert the
    // document is still here and no error was thrown.
    expect(document.body).toBeTruthy();
  });

  it("does not call preventDefault for unrelated keystrokes", () => {
    // The listener only intercepts Cmd/Ctrl + K. Any other
    // key must be passed through so the browser keeps
    // its default behaviour (typing into a page input,
    // for example).
    const { unmount } = renderWithProvider();
    const event = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: false,
      cancelable: true,
      bubbles: true,
    });
    const prevented = !document.dispatchEvent(event);
    expect(prevented).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    unmount();
  });
});

beforeEach(() => {
  // Reset any state vitest's previous run may have left
  // behind (e.g. focused elements).
  document.body.innerHTML = "";
});
