// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import {
  mergeGridMetadata,
  useViewsGridMutation,
} from "./use-views-grid-mutation";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

function QueryWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("mergeGridMetadata", () => {
  it("merges metadata changes for PATCH", () => {
    expect(
      mergeGridMetadata(
        { status: "todo", start_date: "2025-01-01T00:00:00.000Z" },
        { status: "done", due_date: "2025-02-01T00:00:00.000Z" }
      )
    ).toEqual({
      status: "done",
      start_date: "2025-01-01T00:00:00.000Z",
      due_date: "2025-02-01T00:00:00.000Z",
    });
  });
});

describe("useViewsGridMutation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("PATCHes merged metadata with type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useViewsGridMutation(), {
      wrapper: QueryWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: "item-1",
        type: "task",
        metadata: {
          status: "in_progress",
          due_date: "2025-06-01T00:00:00.000Z",
        },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          type: "task",
          metadata: {
            status: "in_progress",
            due_date: "2025-06-01T00:00:00.000Z",
          },
        }),
      })
    );

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled();
    });
  });

  it("toasts on mutation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Nope" } }),
      })
    );

    const { result } = renderHook(() => useViewsGridMutation(), {
      wrapper: QueryWrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: "item-2",
          type: "event",
          metadata: { status: "done" },
        })
      ).rejects.toThrow("Nope");
    });

    expect(toastError).toHaveBeenCalledWith("Nope");
  });
});
