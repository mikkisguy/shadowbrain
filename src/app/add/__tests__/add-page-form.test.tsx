// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AddPageForm } from "@/app/add/add-page-form";

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

function renderForm(props?: {
  prefillType?: string;
  prefillText?: string;
  prefillUrl?: string;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddPageForm {...props} />
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

describe("AddPageForm – Image upload", () => {
  it("shows drop zone when type is Image", async () => {
    const user = userEvent.setup();
    renderForm();

    // Default type (raw_text) — no drop zone
    expect(
      screen.queryByTestId("add-dialog-drop-zone")
    ).not.toBeInTheDocument();

    // Switch to "image"
    const typeTrigger = screen.getByLabelText("Content type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", { name: "Image" });
    await user.click(imageOption);

    // Drop zone should now be visible
    expect(screen.getByTestId("add-dialog-drop-zone")).toBeInTheDocument();
  });

  it("shows URL input when type is Image", async () => {
    const user = userEvent.setup();
    renderForm();

    // Switch to "image"
    const typeTrigger = screen.getByLabelText("Content type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", { name: "Image" });
    await user.click(imageOption);

    // URL input should be visible
    const urlInput = screen.getByTestId("add-dialog-image-url");
    expect(urlInput).toBeInTheDocument();
    expect(urlInput).toHaveAttribute(
      "placeholder",
      expect.stringContaining("URL")
    );
  });

  it("submit button label is 'Upload' for image type", async () => {
    const user = userEvent.setup();
    renderForm();

    // Switch to "image"
    const typeTrigger = screen.getByLabelText("Content type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", { name: "Image" });
    await user.click(imageOption);

    // Submit button should say "Upload"
    const submitBtn = screen.getByTestId("add-page-submit");
    expect(submitBtn).toHaveTextContent("Upload");
  });

  it("submit button is disabled when no file or URL selected", async () => {
    const user = userEvent.setup();
    renderForm();

    // Switch to "image"
    const typeTrigger = screen.getByLabelText("Content type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", { name: "Image" });
    await user.click(imageOption);

    // No file, no URL — submit disabled
    expect(screen.getByTestId("add-page-submit")).toBeDisabled();
  });

  it("submits URL to /api/images when image URL is entered", async () => {
    const user = userEvent.setup();
    renderForm();

    // Switch to "image"
    const typeTrigger = screen.getByLabelText("Content type");
    await user.click(typeTrigger);
    const imageOption = await screen.findByRole("option", { name: "Image" });
    await user.click(imageOption);

    // Enter a URL
    await user.type(
      screen.getByTestId("add-dialog-image-url"),
      "https://example.com/photo.png"
    );

    // Submit button should now be enabled
    expect(screen.getByTestId("add-page-submit")).not.toBeDisabled();

    // Submit
    await user.click(screen.getByTestId("add-page-submit"));

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
});
