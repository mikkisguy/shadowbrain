// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-config";

import { useViewsKanbanMutation } from "./use-views-kanban-mutation";
import type { GridRow } from "./types";

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const row: GridRow = {
  id: "task-1",
  type: "task",
  title: "Prepare launch",
  status: "todo",
  startOrDue: "2025-06-01T00:00:00.000Z",
  end: null,
  parent: null,
  tags: [],
  updatedAt: "2025-05-01T00:00:00.000Z",
  metadata: { status: "todo", due_date: "2025-06-01T00:00:00.000Z" },
};

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe("useViewsKanbanMutation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("PATCHes the card type with metadata merged to its destination status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useViewsKanbanMutation(null), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: row.id,
        type: "task",
        fromStatus: "todo",
        toStatus: "done",
        metadata: row.metadata,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/task-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          type: "task",
          metadata: {
            status: "done",
            due_date: "2025-06-01T00:00:00.000Z",
          },
        }),
      })
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("does not PATCH a move to the card's current status", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useViewsKanbanMutation(null), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.moveCard({
        id: row.id,
        type: "task",
        fromStatus: "todo",
        toStatus: "todo",
        metadata: row.metadata,
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalidates the views and browse caches after a successful move", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useViewsKanbanMutation(null), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: row.id,
        type: "task",
        fromStatus: "todo",
        toStatus: "in_progress",
        metadata: row.metadata,
      });
    });

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.views.all,
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.browse.all,
      });
    });
  });

  it("restores its optimistic grid row and reports an error when PATCH fails", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.views.grid(null), [row]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Move rejected" } }),
      })
    );
    const { result } = renderHook(() => useViewsKanbanMutation(null), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: row.id,
          type: "task",
          fromStatus: "todo",
          toStatus: "done",
          metadata: row.metadata,
        })
      ).rejects.toThrow("Move rejected");
    });

    expect(
      queryClient.getQueryData<GridRow[]>(queryKeys.views.grid(null))
    ).toEqual([row]);
    expect(toastError).toHaveBeenCalledWith("Move rejected");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
