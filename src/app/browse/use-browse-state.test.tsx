// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";

import { useBrowseState } from "./use-browse-state";
import type { BrowseResponse } from "./types";

/**
 * Tests for the Browse-state hook.
 *
 * The hook owns three concerns:
 *   1. **URL ⇄ filter state sync.** The active filter set is the
 *      URL; the hook reads it via `useSearchParams` and writes it
 *      via `useRouter().replace`.
 *   2. **Debounced search.** Search input is debounced by 300ms.
 *   3. **Request cancellation.** Each filter change aborts the
 *      previous in-flight request.
 *
 * We mock `next/navigation` and the API client. The mock router
 * mirrors Next.js's behaviour: it updates a shared `searchParams`
 * store and notifies subscribers in a microtask, so the wrapped
 * component re-renders with the new URL after `act` flushes.
 *
 * Implementation note: the `useSearchParams` mock returns the
 * current value of the shared store. The wrapper component
 * (`StoreSubscriber`) listens for store updates and bumps a
 * useState, which forces the child hook to re-evaluate. This is
 * the test equivalent of Next.js's automatic page invalidation
 * on `router.replace`.
 */

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
      // Notify subscribers synchronously. Mirrors Next.js's
      // behaviour where `router.replace` invalidates the page
      // and re-renders synchronously.
      for (const sub of storeSubscribers) sub();
    }),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => searchParamsStore.value,
}));

interface FetchSpy {
  callCount: number;
  lastFilters: Record<string, string> | undefined;
  lastPage: number | undefined;
  lastLimit: number | undefined;
  lastSignal: AbortSignal | undefined;
  signals: AbortSignal[];
  reset: () => void;
}

const fetchSpy: FetchSpy = {
  callCount: 0,
  lastFilters: undefined,
  lastPage: undefined,
  lastLimit: undefined,
  lastSignal: undefined,
  signals: [],
  reset: () => {
    fetchSpy.callCount = 0;
    fetchSpy.lastFilters = undefined;
    fetchSpy.lastPage = undefined;
    fetchSpy.lastLimit = undefined;
    fetchSpy.lastSignal = undefined;
    fetchSpy.signals = [];
  },
};

let fetchMock = vi.fn();

vi.mock("./api", () => ({
  fetchBrowseItems: (
    filters: Record<string, string>,
    options: { page?: number; limit?: number; signal?: AbortSignal } = {}
  ) => {
    fetchSpy.callCount += 1;
    fetchSpy.lastFilters = filters;
    fetchSpy.lastPage = options.page;
    fetchSpy.lastLimit = options.limit;
    fetchSpy.lastSignal = options.signal;
    if (options.signal) {
      fetchSpy.signals.push(options.signal);
    }
    return fetchMock(filters, options);
  },
  BrowseApiError: class BrowseApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "BrowseApiError";
      this.status = status;
    }
  },
}));

function buildResponse(
  overrides: Partial<BrowseResponse> = {}
): BrowseResponse {
  return {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    ...overrides,
  };
}

beforeEach(() => {
  searchParamsStore.value = new URLSearchParams();
  storeSubscribers.clear();
  replaceCalls.length = 0;
  fetchMock = vi.fn();
  fetchSpy.reset();
  fetchMock.mockResolvedValue(buildResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Test wrapper that bumps a useState on every render so the
 * child hook re-evaluates. Combined with the mock's
 * `searchParams` returning a new reference on every URL change,
 * the child's effects see their deps change and re-run.
 */
function StoreSubscriber({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  // Subscribe to the store on mount; bump version on every
  // notification. The hook then sees `version` in its render
  // pass via the dep list.
  useEffect(() => {
    const sub = () => setVersion((v) => v + 1);
    storeSubscribers.add(sub);
    return () => {
      storeSubscribers.delete(sub);
    };
  }, []);
  // Reference `version` so the lint sees this component as
  // using the state we just bumped.
  void version;
  return <>{children}</>;
}

describe("useBrowseState", () => {
  it("starts on the 'all' tab and triggers an initial fetch", async () => {
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    expect(result.current.typeTab).toBe("all");
    expect(fetchSpy.callCount).toBeGreaterThanOrEqual(1);
    expect(fetchSpy.lastFilters).not.toHaveProperty("type");
  });

  it("reads the initial type from the URL", () => {
    searchParamsStore.value = new URLSearchParams({ type: "journal" });
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    expect(result.current.typeTab).toBe("journal");
  });

  it("falls back to 'all' for an unknown type value", () => {
    searchParamsStore.value = new URLSearchParams({ type: "not-a-real-type" });
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    expect(result.current.typeTab).toBe("all");
  });

  it("writes filter changes to the URL via router.replace", () => {
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    act(() => {
      result.current.setFilters({ type: "note" });
    });
    expect(replaceCalls).toHaveLength(1);
    const last = replaceCalls[replaceCalls.length - 1];
    expect(last.url).toBe("/?type=note");
    expect(last.scroll).toBe(false);
  });

  it("drops empty / whitespace filter values from the URL", () => {
    searchParamsStore.value = new URLSearchParams({
      type: "note",
      q: "docker",
    });
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    act(() => {
      result.current.setFilters({ type: "" });
    });
    const last = replaceCalls[replaceCalls.length - 1];
    expect(last.url).toBe("/?q=docker");
    expect(last.url).not.toMatch(/type=/);
  });

  it("refetches when a non-search filter changes", async () => {
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    const before = fetchSpy.callCount;
    act(() => {
      result.current.setFilters({ type: "note" });
    });
    await waitFor(() => {
      expect(fetchSpy.callCount).toBeGreaterThan(before);
    });
    expect(fetchSpy.lastFilters?.type).toBe("note");
  });

  it("debounces the search input by 300ms before sending q to the API", async () => {
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    const before = fetchSpy.callCount;

    act(() => result.current.setFilters({ q: "d" }));
    act(() => result.current.setFilters({ q: "do" }));
    act(() => result.current.setFilters({ q: "docker" }));

    const lastReplace = replaceCalls[replaceCalls.length - 1];
    expect(lastReplace.url).toBe("/?q=docker");

    // The fetch count has not changed yet — the debounce is
    // still pending.
    expect(fetchSpy.callCount).toBe(before);

    // Wait past the 300ms debounce.
    await new Promise((resolve) => setTimeout(resolve, 350));

    await waitFor(() => {
      expect(fetchSpy.callCount).toBeGreaterThan(before);
    });
    expect(fetchSpy.lastFilters?.q).toBe("docker");
  });

  it("cancels the previous request when filters change", async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise<BrowseResponse>(() => {
          // Never resolves; the test inspects the abort signal
          // to confirm cancellation.
        })
    );
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    await waitFor(() => {
      expect(fetchSpy.lastSignal).toBeDefined();
    });
    const firstSignal = fetchSpy.lastSignal!;
    const before = fetchSpy.callCount;
    act(() => {
      result.current.setFilters({ type: "note" });
    });
    await waitFor(() => {
      expect(fetchSpy.callCount).toBeGreaterThan(before);
    });
    expect(firstSignal.aborted).toBe(true);
  });

  it("surfaces API errors with a generic user-safe message", async () => {
    const err = new Error("nope");
    fetchMock.mockRejectedValueOnce(err);
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toMatch(/Couldn't load your brain/);
    expect(result.current.error).not.toMatch(/nope/);
  });

  it("clearFilters resets the URL to '/'", () => {
    searchParamsStore.value = new URLSearchParams({
      type: "note",
      q: "docker",
    });
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    act(() => {
      result.current.clearFilters();
    });
    const last = replaceCalls[replaceCalls.length - 1];
    expect(last.url).toBe("/");
  });

  it("retry re-issues the same request", async () => {
    const { result } = renderHook(() => useBrowseState(), {
      wrapper: StoreSubscriber,
    });
    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    const before = fetchSpy.callCount;
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(fetchSpy.callCount).toBeGreaterThan(before);
    });
  });
});
