// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdvancedFilters } from "./advanced-filters";
import type { BrowseFilters } from "./types";

/**
 * Advanced-filters tests.
 *
 * The panel renders four inputs (tag, source, from, to) plus a
 * "Clear all" button. Each input commits its value to the parent
 * on blur and on Enter, not on every keystroke (the URL would
 * thrash otherwise). The "Clear all" button is disabled until at
 * least one secondary filter is set.
 */

const empty: BrowseFilters = {};

describe("AdvancedFilters", () => {
  it("renders the four filter inputs", () => {
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={() => undefined}
        onClear={() => undefined}
      />
    );
    expect(screen.getByTestId("advanced-tag")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-source")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-start")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-end")).toBeInTheDocument();
  });

  it("commits tag on blur", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={onPatch}
        onClear={() => undefined}
      />
    );
    const tagInput = screen.getByTestId("advanced-tag");
    await user.type(tagInput, "docker");
    await user.tab();
    expect(onPatch).toHaveBeenCalledWith({ tag: "docker" });
  });

  it("commits tag on Enter", async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={onPatch}
        onClear={() => undefined}
      />
    );
    const tagInput = screen.getByTestId("advanced-tag");
    await user.type(tagInput, "docker{Enter}");
    expect(onPatch).toHaveBeenCalledWith({ tag: "docker" });
  });

  it("disables Clear all when no secondary filters are active", () => {
    render(
      <AdvancedFilters
        filters={empty}
        onPatch={() => undefined}
        onClear={() => undefined}
      />
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
      />
    );
    const button = screen.getByTestId("advanced-clear");
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(onClear).toHaveBeenCalledOnce();
  });
});
