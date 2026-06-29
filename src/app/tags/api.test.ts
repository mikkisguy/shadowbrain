// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TagsApiError,
  createTag,
  deleteTag,
  deleteUnusedTags,
  fetchTags,
  mergeTag,
  renameTag,
} from "./api";

/**
 * Tests for the Tags API client.
 *
 * Each test stubs `global.fetch` and asserts both the request shape
 * (method, URL, body) and the response handling — including the 409
 * → `CONFLICT` code mapping the dialogs rely on for inline duplicate
 * messages.
 */

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTags", () => {
  it("GETs /api/tags and returns the tags array", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        tags: [
          { id: "1", name: "alpha", color: null, created_at: "x", count: 3 },
        ],
        total: 1,
      })
    );

    const result = await fetchTags();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tags",
      expect.objectContaining({ method: "GET", credentials: "same-origin" })
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("alpha");
    expect(result[0].count).toBe(3);
  });

  it("returns an empty array when the body has no tags", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    expect(await fetchTags()).toEqual([]);
  });

  it("throws a TagsApiError on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    await expect(fetchTags()).rejects.toBeInstanceOf(TagsApiError);
  });

  it("forwards the abort signal", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tags: [] }));
    const controller = new AbortController();
    await fetchTags(controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe("createTag", () => {
  it("POSTs the name and returns the created tag", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { id: "9", name: "new", color: null, created_at: "x" },
        { status: 201 }
      )
    );

    const tag = await createTag("new");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tags",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "new" }),
      })
    );
    expect(tag.id).toBe("9");
  });

  it("maps a 409 to a TagsApiError with code CONFLICT", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "CONFLICT", message: "exists" } },
        { status: 409 }
      )
    );

    await expect(createTag("dup")).rejects.toMatchObject({
      name: "TagsApiError",
      status: 409,
      code: "CONFLICT",
    });
  });
});

describe("renameTag", () => {
  it("PATCHes /api/tags/[id] with the new name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "5", name: "renamed", color: null, created_at: "x" })
    );

    const tag = await renameTag("5", "renamed");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tags/5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "renamed" }),
      })
    );
    expect(tag.name).toBe("renamed");
  });

  it("encodes the id in the URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await renameTag("a/b", "x");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tags/a%2Fb");
  });
});

describe("deleteTag", () => {
  it("DELETEs /api/tags/[id]", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "7" }));
    await deleteTag("7");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tags/7",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("throws a TagsApiError on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 404 }));
    await expect(deleteTag("missing")).rejects.toBeInstanceOf(TagsApiError);
  });
});

describe("deleteUnusedTags", () => {
  it("POSTs /api/tags/delete-unused and returns the deleted count", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: 2 }));
    const result = await deleteUnusedTags();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tags/delete-unused",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.deleted).toBe(2);
  });
});

describe("mergeTag", () => {
  it("POSTs /api/tags/[id]/merge with the target id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "beta",
        name: "beta",
        color: null,
        created_at: "x",
        count: 4,
      })
    );

    const result = await mergeTag("alpha", "beta");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tags/alpha/merge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetId: "beta" }),
      })
    );
    expect(result.count).toBe(4);
  });

  it("encodes the source id in the URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await mergeTag("a/b", "c");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tags/a%2Fb/merge");
  });
});
