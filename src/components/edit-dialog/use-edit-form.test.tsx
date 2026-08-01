// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/db/index";
import { draftFromItem } from "./draft-helpers";
import { useEditForm } from "./use-edit-form";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const item = {
  id: "item-1",
  type: "note",
  title: "Test note",
  content: "Original content",
  image_path: null,
  source: "manual",
  source_url: null,
  metadata: null,
  is_private: 0,
  is_hidden: 0,
  created_at: "2026-06-21T12:00:00.000Z",
  updated_at: "2026-06-22T08:30:00.000Z",
} as ContentItem;

function QueryWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useEditForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps visibility flags off for ordinary callers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    const initialDraft = draftFromItem(item, []);

    const { result } = renderHook(
      () => {
        const [draft, setDraft] = useState(initialDraft);
        const initialDraftRef = useRef(initialDraft);
        return {
          draft,
          ...useEditForm({
            item,
            initialDraftRef,
            setDraft,
            onHasChangesChange: vi.fn(),
            onForceClose: vi.fn(),
          }),
        };
      },
      { wrapper: QueryWrapper }
    );

    await act(async () => {
      await result.current.mutation.mutateAsync({
        ...result.current.draft,
        content: "Changed content",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("appends both visibility flags when opted in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    const initialDraft = draftFromItem(item, []);

    const { result } = renderHook(
      () => {
        const [draft, setDraft] = useState(initialDraft);
        const initialDraftRef = useRef(initialDraft);
        return {
          draft,
          ...useEditForm({
            item,
            initialDraftRef,
            setDraft,
            onHasChangesChange: vi.fn(),
            onForceClose: vi.fn(),
            includeHidden: true,
            includePrivate: true,
          }),
        };
      },
      { wrapper: QueryWrapper }
    );

    await act(async () => {
      await result.current.mutation.mutateAsync({
        ...result.current.draft,
        content: "Changed content",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-1?include_hidden=1&include_private=1",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});
