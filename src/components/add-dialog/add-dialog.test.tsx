// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AddButton, AddDialogRoot } from "@/components/add-dialog";

/**
 * Integration test for the quick-add dialog (AddDialog + AddButton).
 *
 * Mounts the real provider and dialog together so the ref-backed draft
 * persistence, submit flow, type-specific field toggling, and keyboard
 * shortcut are exercised in a realistic render tree.
 *
 * All network calls (POST /api/items) are mocked with `fetchMock` so
 * the test never touches a real database. The `toast` from "sonner" is
 * also mocked so assertions can observe the success call without a real
 * toast renderer.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
  },
}));

const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddDialogRoot>
        <AddButton />
      </AddDialogRoot>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  toastSuccess.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ id: "new-item" }));
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AddDialog", () => {
  it("opens when the trigger button is clicked and shows the form", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Dialog body is absent before opening
    expect(screen.queryByTestId("add-dialog-title")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-dialog-content")).not.toBeInTheDocument();

    // Click the "+" trigger
    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Form elements are now visible
    expect(screen.getByTestId("add-dialog-type")).toBeInTheDocument();
    expect(screen.getByTestId("add-dialog-title")).toBeInTheDocument();
    expect(screen.getByTestId("add-dialog-content")).toBeInTheDocument();
    expect(screen.getByTestId("add-dialog-submit")).toBeInTheDocument();
  });

  it("persists draft state across close/reopen cycles", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Open and fill fields
    await user.click(screen.getByTestId("add-dialog-trigger"));
    await user.type(screen.getByTestId("add-dialog-title"), "Persisted Title");
    await user.type(
      screen.getByTestId("add-dialog-content"),
      "Persisted content"
    );

    // Close via the Cancel button
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // Verify dialog closed
    await waitFor(() => {
      expect(screen.queryByTestId("add-dialog-title")).not.toBeInTheDocument();
    });

    // Reopen
    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Values are still there
    expect(screen.getByTestId("add-dialog-title")).toHaveValue(
      "Persisted Title"
    );
    expect(screen.getByTestId("add-dialog-content")).toHaveValue(
      "Persisted content"
    );
  });

  it("clears the draft on successful submit", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Open and fill
    await user.click(screen.getByTestId("add-dialog-trigger"));
    await user.type(screen.getByTestId("add-dialog-title"), "Will be cleared");
    await user.type(
      screen.getByTestId("add-dialog-content"),
      "Content to clear"
    );

    // Submit (default mock returns 200)
    await user.click(screen.getByTestId("add-dialog-submit"));

    // Wait for toast-success → submit completed
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Saved.");
    });

    // The dialog auto-closes on success; wait for it to be gone
    await waitFor(() => {
      expect(screen.queryByTestId("add-dialog-title")).not.toBeInTheDocument();
    });

    // Reopen — draft should be empty
    await user.click(screen.getByTestId("add-dialog-trigger"));
    expect(screen.getByTestId("add-dialog-title")).toHaveValue("");
    expect(screen.getByTestId("add-dialog-content")).toHaveValue("");
  });

  it("submits POST /api/items with the correct body for a bookmark", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Set type to "bookmark" via the Select
    const typeTrigger = screen.getByTestId("add-dialog-type");
    await user.click(typeTrigger);
    const bookmarkOption = await screen.findByRole("option", {
      name: "Bookmark",
    });
    await user.click(bookmarkOption);

    // Fill in bookmark fields
    await user.type(screen.getByTestId("add-dialog-title"), "Example Site");
    await user.type(
      screen.getByTestId("add-dialog-bookmark-url"),
      "https://example.com"
    );

    // Submit
    await user.click(screen.getByTestId("add-dialog-submit"));

    // The debounced preview fetch may also have fired by now; find the
    // POST /api/items call among all fetch calls.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const itemsCall = fetchMock.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === "/api/items"
    ) as [string, RequestInit] | undefined;
    expect(itemsCall).toBeDefined();
    const body = JSON.parse(itemsCall![1].body as string);

    expect(body).toEqual({
      type: "bookmark",
      content: "https://example.com", // falls back from sourceUrl when content is empty
      source: "web",
      title: "Example Site",
      source_url: "https://example.com",
    });
  });

  it("displays error message on API failure", async () => {
    const user = userEvent.setup();
    // Override the default fetch mock with a 500
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Server error" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));
    await user.type(screen.getByTestId("add-dialog-content"), "This will fail");

    await user.click(screen.getByTestId("add-dialog-submit"));

    const errorEl = await screen.findByTestId("add-dialog-error");
    expect(errorEl).toHaveTextContent("Server error");
  });

  it("disables the submit button when the form is empty", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Default type is raw_text, which requires content — both title and
    // content are empty so canSubmit returns false.
    expect(screen.getByTestId("add-dialog-submit")).toBeDisabled();
  });

  it("submits on Ctrl+Enter keyboard shortcut", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Fill required content first
    const textarea = screen.getByTestId("add-dialog-content");
    await user.type(textarea, "Keyboard submit");

    // Ctrl+Enter on the textarea
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows and hides type-specific fields when the type changes", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Default type is "raw_text" — no Details section
    expect(screen.queryByText(/details/i)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("add-dialog-bookmark-url")
    ).not.toBeInTheDocument();

    // Switch to "bookmark"
    const typeTrigger = screen.getByTestId("add-dialog-type");
    await user.click(typeTrigger);
    const bookmarkOption = await screen.findByRole("option", {
      name: "Bookmark",
    });
    await user.click(bookmarkOption);

    // Details section and bookmark URL field appear
    expect(screen.getByText(/details/i)).toBeInTheDocument();
    expect(screen.getByTestId("add-dialog-bookmark-url")).toBeInTheDocument();

    // Switch back to "raw_text"
    await user.click(typeTrigger);
    const rawOption = await screen.findByRole("option", { name: "Raw" });
    await user.click(rawOption);

    // Details section and bookmark field disappear again
    expect(screen.queryByText(/details/i)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("add-dialog-bookmark-url")
    ).not.toBeInTheDocument();
  });

  it("shows drop zone when type is Image and hides content textarea", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Default type: content textarea visible, no drop zone
    expect(screen.getByTestId("add-dialog-content")).toBeInTheDocument();
    expect(
      screen.queryByTestId("add-dialog-drop-zone")
    ).not.toBeInTheDocument();

    // Switch to "image"
    const typeTrigger = screen.getByTestId("add-dialog-type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", {
      name: "Image",
    });
    await user.click(imageOption);

    // Drop zone now visible, content textarea is the one below it
    expect(screen.getByTestId("add-dialog-drop-zone")).toBeInTheDocument();
    // File input is hidden inside the drop zone
    expect(screen.getByTestId("add-dialog-file-input")).toBeInTheDocument();

    // Submit button label changes to "Upload"
    expect(screen.getByTestId("add-dialog-submit")).toHaveTextContent("Upload");
  });

  it("shows URL input when type is Image", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Switch to "image"
    const typeTrigger = screen.getByTestId("add-dialog-type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", {
      name: "Image",
    });
    await user.click(imageOption);

    // URL input is visible
    const urlInput = screen.getByTestId("add-dialog-image-url");
    expect(urlInput).toBeInTheDocument();
    expect(urlInput).toHaveAttribute(
      "placeholder",
      expect.stringContaining("URL")
    );
  });

  it("submits URL to /api/images when image URL is entered", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Switch to "image"
    const typeTrigger = screen.getByTestId("add-dialog-type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", {
      name: "Image",
    });
    await user.click(imageOption);

    // Enter a URL
    await user.type(
      screen.getByTestId("add-dialog-image-url"),
      "https://example.com/photo.png"
    );

    // Submit button should now be enabled
    expect(screen.getByTestId("add-dialog-submit")).not.toBeDisabled();

    // Submit
    await user.click(screen.getByTestId("add-dialog-submit"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/images",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const imagesCall = fetchMock.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === "/api/images"
    ) as [string, RequestInit] | undefined;
    expect(imagesCall).toBeDefined();
    const body = JSON.parse(imagesCall![1].body as string);
    expect(body.url).toBe("https://example.com/photo.png");
  });

  it("hides drop zone when switching from image back to another type", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Switch to "image"
    const typeTrigger = screen.getByTestId("add-dialog-type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", {
      name: "Image",
    });
    await user.click(imageOption);

    expect(screen.getByTestId("add-dialog-drop-zone")).toBeInTheDocument();

    // Switch back to "note"
    await user.click(typeTrigger);
    const noteOption = await screen.findByRole("option", { name: "Note" });
    await user.click(noteOption);

    // Drop zone gone, content textarea back
    expect(
      screen.queryByTestId("add-dialog-drop-zone")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("add-dialog-content")).toBeInTheDocument();
  });

  it("shows disabled submit button for image type without file or URL", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("add-dialog-trigger"));

    // Switch to "image"
    const typeTrigger = screen.getByTestId("add-dialog-type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", {
      name: "Image",
    });
    await user.click(imageOption);

    // No file, no URL — submit disabled
    expect(screen.getByTestId("add-dialog-submit")).toBeDisabled();
  });
});
