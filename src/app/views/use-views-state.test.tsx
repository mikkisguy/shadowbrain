// @vitest-environment jsdom

import React, { useEffect, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { useViewsState } from "./use-views-state";

const searchParamsStore: { value: URLSearchParams } = {
  value: new URLSearchParams(),
};
const storeSubscribers = new Set<() => void>();
const replaceCalls: { url: string; scroll: boolean }[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn((url: string, opts?: { scroll?: boolean }) => {
      replaceCalls.push({ url, scroll: opts?.scroll ?? false });
      const u = new URL(url, "http://localhost");
      searchParamsStore.value = u.searchParams;
      for (const sub of storeSubscribers) sub();
    }),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/views",
  useSearchParams: () => searchParamsStore.value,
}));

function StoreSubscriber({ children }: { children: React.ReactNode }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const sub = () => bump((n) => n + 1);
    storeSubscribers.add(sub);
    return () => {
      storeSubscribers.delete(sub);
    };
  }, []);
  return children;
}

beforeEach(() => {
  searchParamsStore.value = new URLSearchParams();
  replaceCalls.length = 0;
});

describe("useViewsState", () => {
  it("defaults to grid with no project or item", () => {
    const { result } = renderHook(() => useViewsState(), {
      wrapper: StoreSubscriber,
    });
    expect(result.current.view).toBe("grid");
    expect(result.current.projectId).toBeNull();
    expect(result.current.itemId).toBeNull();
  });

  it("reads initial state from the URL", () => {
    searchParamsStore.value = new URLSearchParams({
      view: "timeline",
      project: "proj-1",
      item: "item-1",
    });
    const { result } = renderHook(() => useViewsState(), {
      wrapper: StoreSubscriber,
    });
    expect(result.current.view).toBe("timeline");
    expect(result.current.projectId).toBe("proj-1");
    expect(result.current.itemId).toBe("item-1");
  });

  it("writes view changes via router.replace without scroll", () => {
    const { result } = renderHook(() => useViewsState(), {
      wrapper: StoreSubscriber,
    });
    act(() => {
      result.current.setView("kanban");
    });
    expect(replaceCalls).toHaveLength(1);
    expect(replaceCalls[0]?.url).toBe("/views?view=kanban");
    expect(replaceCalls[0]?.scroll).toBe(false);
  });

  it("removes project from the URL when cleared", () => {
    searchParamsStore.value = new URLSearchParams({ project: "proj-1" });
    const { result } = renderHook(() => useViewsState(), {
      wrapper: StoreSubscriber,
    });
    act(() => {
      result.current.setProjectId(null);
    });
    expect(replaceCalls.at(-1)?.url).toBe("/views");
  });

  it("sets and clears the item param for the preview sheet", () => {
    const { result } = renderHook(() => useViewsState(), {
      wrapper: StoreSubscriber,
    });
    act(() => {
      result.current.setItemId("task-1");
    });
    expect(replaceCalls.at(-1)?.url).toBe("/views?item=task-1");

    act(() => {
      result.current.clearItem();
    });
    expect(replaceCalls.at(-1)?.url).toBe("/views");
  });
});
