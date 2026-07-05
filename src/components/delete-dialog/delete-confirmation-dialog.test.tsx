// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";

/**
 * Tests for the shared delete confirmation dialog.
 *
 * The dialog is a pure UI component driven by props; it does not
 * call any API or manage query state itself. We verify that:
 *  1. The item title (or "Untitled") and type label are displayed.
 *  2. `onConfirm` fires on "Delete" click.
 *  3. `onConfirm` does not fire on "Cancel" click.
 *  4. The Delete button shows a loading spinner and is disabled when
 *     `isDeleting` is true.
 */

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

function defaultProps(
  overrides: Partial<Parameters<typeof DeleteConfirmationDialog>[0]> = {}
) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    itemTitle: "Test Item",
    itemType: "note",
    onConfirm: vi.fn(),
    isDeleting: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(
  overrides: Partial<Parameters<typeof DeleteConfirmationDialog>[0]> = {}
) {
  return render(<DeleteConfirmationDialog {...defaultProps(overrides)} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeleteConfirmationDialog", () => {
  it("renders item title and type when open", () => {
    renderDialog();

    expect(screen.getByText("Test Item")).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
  });

  it('renders "Untitled" when title is null', () => {
    renderDialog({ itemTitle: null });

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("calls onConfirm when Delete button clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    renderDialog({ onConfirm });

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not call onConfirm when Cancel clicked", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderDialog({ onConfirm, onOpenChange });

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows loading state on Delete button when isDeleting", () => {
    renderDialog({ isDeleting: true });

    const deleteButton = screen.getByRole("button", { name: /deleting/i });
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toBeDisabled();

    // Loader2 spinner should be present
    const spinner = deleteButton.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("disables Delete button when isDeleting", () => {
    renderDialog({ isDeleting: true });

    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
  });
});
