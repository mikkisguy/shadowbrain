// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTags } from "./use-tags";
import type { TagWithCount } from "./types";

/**
 * Tests for the tags-list hook.
 *
 * The hook owns the `GET /api/tags` lifecycle and a `refresh`
 * re-fetch. We mock the API client so the test controls the
 * resolved list and can assert the loading → success / error
 * transitions and that `refresh` triggers a new fetch.
 */

const fetchTagsMock = vi.fn();

vi.mock("./api", () => ({
  fetchTags: (signal?: AbortSignal) => fetchTagsMock(signal),
}));

function tag(name: string, count = 0): TagWithCount {
  return { id: name, name, color: null, created_at: "x", count };
}

beforeEach(() => {
  fetchTagsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTags", () => {
  it("loads the tag list on mount", async () => {
    fetchTagsMock.mockResolvedValueOnce([tag("alpha", 2)]);

    const { result } = renderHook(() => useTags());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.tags).toHaveLength(1);
    expect(result.current.tags[0].name).toBe("alpha");
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error when the fetch rejects", async () => {
    fetchTagsMock.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useTags());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeTruthy();
  });

  it("re-fetches when refresh is called", async () => {
    fetchTagsMock.mockResolvedValueOnce([tag("alpha")]);
    const { result } = renderHook(() => useTags());
    await waitFor(() => expect(result.current.status).toBe("success"));

    fetchTagsMock.mockResolvedValueOnce([tag("alpha"), tag("beta")]);
    result.current.refresh();

    await waitFor(() => expect(result.current.tags).toHaveLength(2));
    expect(fetchTagsMock).toHaveBeenCalledTimes(2);
  });
});
