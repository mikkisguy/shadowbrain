// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBrowseItems, BrowseApiError } from "./api";

/**
 * Tests for the Browse API client.
 *
 * The client is a thin wrapper over `fetch` that:
 *   - picks `/api/items` when no `q` is set, `/api/search` when it
 *     is, and forwards the right query string in either case
 *   - normalises the two response shapes into `BrowseResponse`
 *   - throws `BrowseApiError` on non-2xx
 *
 * Each test stubs `globalThis.fetch` with a per-test mock so the
 * URL building is observable and we never touch the network.
 */

interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];
let nextResponse: (url: string) => Response = () =>
  new Response("not configured", { status: 500 });

function mockFetch() {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(nextResponse(url));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchBrowseItems", () => {
  beforeEach(() => {
    mockFetch();
  });

  it("calls /api/items when no q is set", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          items: [{ id: "a", type: "note" }],
          total: 1,
          page: 1,
          limit: 20,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const result = await fetchBrowseItems({});
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toMatch(/^\/api\/items\?/);
    expect(call.url).not.toMatch(/q=/);
    expect(call.init.credentials).toBe("same-origin");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("a");
    expect(result.items[0].type).toBe("note");
    expect(result.items[0].image_url).toBeNull();
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("prefixes a relative image_path with /api/images/ in /api/items results", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "1",
              type: "note",
              title: null,
              content: "x",
              image_path: "notes/2026-01/abc.webp",
              source: "manual",
              source_url: null,
              created_at: "2026-06-21T00:00:00.000Z",
              updated_at: "2026-06-21T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const result = await fetchBrowseItems({});
    expect(result.items[0].image_url).toBe(
      "/api/images/notes/2026-01/abc.webp"
    );
  });

  it("normalises a leading-slash image_path so the prefix isn't doubled", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "1",
              type: "note",
              title: null,
              content: "x",
              image_path: "/notes/2026-01/abc.webp",
              source: "manual",
              source_url: null,
              created_at: "2026-06-21T00:00:00.000Z",
              updated_at: "2026-06-21T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const result = await fetchBrowseItems({});
    expect(result.items[0].image_url).toBe(
      "/api/images/notes/2026-01/abc.webp"
    );
  });

  it("returns image_url: null when the row has no image", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "1",
              type: "note",
              title: null,
              content: "x",
              image_path: null,
              source: "manual",
              source_url: null,
              created_at: "2026-06-21T00:00:00.000Z",
              updated_at: "2026-06-21T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const result = await fetchBrowseItems({});
    expect(result.items[0].image_url).toBeNull();
  });

  it("routes to /api/search when q is set", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          query: "docker",
          results: [
            {
              id: "x",
              type: "note",
              title: null,
              content: "docker networking",
              source: "manual",
              source_url: null,
              created_at: "2026-06-21T00:00:00.000Z",
              updated_at: "2026-06-21T00:00:00.000Z",
              rank: 1.23,
              snippet: "docker <mark>networking</mark>",
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const result = await fetchBrowseItems({ q: "docker" });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toMatch(/^\/api\/search\?/);
    expect(call.url).toMatch(/q=docker/);
    // The search-only fields (rank, snippet) must not leak into the
    // Browse response shape.
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item).not.toHaveProperty("rank");
    expect(item).not.toHaveProperty("snippet");
    expect(item.id).toBe("x");
  });

  it("drops empty filter values from the query string", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }),
        {
          status: 200,
        }
      );

    await fetchBrowseItems({ type: "note", tag: "", q: undefined });
    const url = calls[0].url;
    expect(url).toMatch(/type=note/);
    expect(url).not.toMatch(/tag=/);
    expect(url).not.toMatch(/q=/);
  });

  it("forwards tag, source, startDate, endDate to /api/items", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }),
        {
          status: 200,
        }
      );

    await fetchBrowseItems({
      tag: "docker",
      source: "discord",
      startDate: "2026-01-01",
      endDate: "2026-06-21",
    });
    const url = calls[0].url;
    expect(url).toMatch(/tag=docker/);
    expect(url).toMatch(/source=discord/);
    expect(url).toMatch(/startDate=2026-01-01/);
    expect(url).toMatch(/endDate=2026-06-21/);
  });

  it("uses an absolute page and limit", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ items: [], total: 0, page: 3, limit: 50 }),
        {
          status: 200,
        }
      );

    await fetchBrowseItems({}, { page: 3, limit: 50 });
    const url = calls[0].url;
    expect(url).toMatch(/page=3/);
    expect(url).toMatch(/limit=50/);
  });

  it("throws BrowseApiError on a non-2xx response", async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR" } }), {
        status: 500,
      });

    await expect(fetchBrowseItems({})).rejects.toBeInstanceOf(BrowseApiError);
    try {
      await fetchBrowseItems({});
    } catch (err) {
      expect((err as BrowseApiError).status).toBe(500);
    }
  });

  it("forwards an AbortSignal to fetch", async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }),
        {
          status: 200,
        }
      );

    const controller = new AbortController();
    await fetchBrowseItems({}, { signal: controller.signal });
    expect(calls[0].init.signal).toBe(controller.signal);
  });
});
