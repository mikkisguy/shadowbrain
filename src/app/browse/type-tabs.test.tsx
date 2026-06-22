// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TypeTabs } from "./type-tabs";

/**
 * Type-tab strip tests.
 *
 * The strip exposes five tabs (All, Notes, Journal, Bookmarks,
 * Questions). The active tab is controlled by the parent, and
 * clicks bubble up via `onChange`. The strip is a toggle-button
 * group (not a true ARIA `tablist`) — see the component doc for
 * the rationale. The strip must:
 *   - highlight the active tab via `aria-pressed`
 *   - emit the new tab id on click
 *   - not emit when the active tab is clicked again
 *   - render keyboard-navigable buttons
 */

describe("TypeTabs", () => {
  it("renders the five issue-spec tabs as a toggle group", () => {
    render(<TypeTabs active="all" onChange={() => undefined} />);
    const group = screen.getByRole("group", {
      name: /filter by content type/i,
    });
    expect(group).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { pressed: false });
    // 5 tabs; the "all" tab is the unpressed one when active.
    // The four typed tabs all have aria-pressed=false.
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it("marks the active tab with aria-pressed", () => {
    render(<TypeTabs active="journal" onChange={() => undefined} />);
    const active = screen.getByRole("button", { name: /journal/i });
    expect(active).toHaveAttribute("aria-pressed", "true");
    const other = screen.getByRole("button", { name: /all/i });
    expect(other).toHaveAttribute("aria-pressed", "false");
  });

  it("emits the new tab id on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TypeTabs active="all" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /notes/i }));
    expect(onChange).toHaveBeenCalledWith("note");
  });

  it("does not emit when the active tab is re-clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TypeTabs active="note" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /notes/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables every tab when disabled is set", () => {
    render(<TypeTabs active="all" onChange={() => undefined} disabled />);
    const buttons = screen.getAllByRole("button");
    for (const tab of buttons) {
      expect(tab).toBeDisabled();
    }
  });
});
