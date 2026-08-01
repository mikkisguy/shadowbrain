// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AddPageForm } from "@/app/add/add-page-form";
import AddPage from "@/app/add/page";
import { queryKeys } from "@/lib/query-config";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const routerPush = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
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
  prefillProjectId?: string;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <AddPageForm {...props} />
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
}

// ---------------------------------------------------------------------------
// Lifecycle
beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  routerPush.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ id: "new-item" }));
  vi.stubGlobal("fetch", fetchMock);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
  globalThis.localStorage?.clear?.();
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

describe("AddPage", () => {
  it("passes the project search param as a form prefill", async () => {
    const page = await AddPage({
      searchParams: Promise.resolve({
        type: "task",
        project: "project-42",
      }),
    });
    const form = (
      page as ReactElement<{
        children: ReactElement<{ prefillProjectId?: string }>;
      }>
    ).props.children;

    expect(form.props.prefillProjectId).toBe("project-42");
  });
});

describe("AddPageForm – project linking", () => {
  it.each(["task", "event"])(
    "links a prefilled %s to the project and returns to its page",
    async (type) => {
      const user = userEvent.setup();
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: `created-${type}` }))
        .mockResolvedValueOnce(jsonResponse({ id: "link-1" }));

      renderForm({
        prefillType: type,
        prefillProjectId: "project-42",
      });

      expect(
        await screen.findByText(`This ${type} will be added to the project.`)
      ).toBeInTheDocument();
      await user.type(
        screen.getByPlaceholderText(
          type === "task"
            ? "Describe this task (optional)…"
            : "Describe this event (optional)…"
        ),
        `${type} details`
      );
      await user.click(screen.getByTestId("add-page-submit"));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/links",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
        );
      });

      const linksCall = fetchMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === "/api/links"
      ) as [string, RequestInit] | undefined;
      expect(linksCall).toBeDefined();
      expect(JSON.parse(linksCall![1].body as string)).toEqual({
        source_id: `created-${type}`,
        target_id: "project-42",
        link_type: "happened_during",
      });
      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith("/item/project-42");
      });
    }
  );
});
describe("AddPageForm – project CTA precedence", () => {
  it.each(["task", "event"])(
    "forces a prefilled %s type over a restored draft",
    async (type) => {
      const user = userEvent.setup();
      globalThis.localStorage?.setItem(
        "shadowbrain:add-draft",
        JSON.stringify({
          type: "note",
          content: "restored note",
          title: "",
          sourceUrl: "",
          email: "",
          phoneNumber: "",
          role: "",
          status: "",
          repo: "",
          started: "",
          goalEndDate: "",
          startDate: "",
          endDate: "",
          duration: "",
          dueDate: "",
          mood: "",
          imageUrl: "",
        })
      );
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: `created-${type}` }))
        .mockResolvedValueOnce(jsonResponse({ id: "link-1" }));

      renderForm({
        prefillType: type,
        prefillProjectId: "project-42",
      });

      expect(
        await screen.findByPlaceholderText(
          type === "task"
            ? "Describe this task (optional)…"
            : "Describe this event (optional)…"
        )
      ).toHaveValue("restored note");
      await user.click(screen.getByTestId("add-page-submit"));

      await waitFor(() => {
        const itemCall = fetchMock.mock.calls.find(
          (call: unknown[]) => (call[0] as string) === "/api/items"
        ) as [string, RequestInit] | undefined;
        expect(itemCall).toBeDefined();
        expect(JSON.parse(itemCall![1].body as string)).toEqual(
          expect.objectContaining({
            type,
            content: "restored note",
          })
        );
      });

      const linksCall = fetchMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === "/api/links"
      ) as [string, RequestInit] | undefined;
      expect(linksCall).toBeDefined();
      expect(JSON.parse(linksCall![1].body as string)).toEqual({
        source_id: `created-${type}`,
        target_id: "project-42",
        link_type: "happened_during",
      });
      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith("/item/project-42");
      });
    }
  );
});

describe("AddPageForm – project link failure", () => {
  it("invalidates browse, clears the draft, and redirects after link failure", async () => {
    const user = userEvent.setup();
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "created-task" }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Link failed" } }, { status: 500 })
      );

    const { queryClient } = renderForm({
      prefillType: "task",
      prefillProjectId: "project-42",
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.type(
      await screen.findByPlaceholderText("Describe this task (optional)…"),
      "task details"
    );
    await user.click(screen.getByTestId("add-page-submit"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Link failed");
      expect(routerPush).toHaveBeenCalledWith("/item/created-task");
    });
    expect(
      fetchMock.mock.calls.filter(
        (call: unknown[]) => (call[0] as string) === "/api/items"
      )
    ).toHaveLength(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.browse.all,
    });
    expect(
      globalThis.localStorage?.getItem("shadowbrain:add-draft")
    ).toBeNull();
  });
});
