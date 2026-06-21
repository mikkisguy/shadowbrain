import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET, POST } from "@/app/api/items/route";
import { GET as GET_BY_ID, PATCH, DELETE } from "@/app/api/items/[id]/route";
import { GET as SEARCH_GET } from "@/app/api/search/route";

// Mock the metadata fetcher so tests don't touch the network. Each test
// sets its own `fetchBookmarkMetadata` behaviour via the per-test
// `mockFetcher` mock below.
vi.mock("@/lib/metadata-fetcher", () => ({
  fetchBookmarkMetadata: vi.fn(),
}));

// Imported lazily after the mock is registered so the route handler
// picks up the mocked implementation.
import { fetchBookmarkMetadata } from "@/lib/metadata-fetcher";
const mockFetcher = vi.mocked(fetchBookmarkMetadata);

/** Build a raw (unauthenticated) Request — used to assert the route
 *  returns 401 even when the caller is trying to opt in. */
function anonRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

interface CreateInput {
  type?: string;
  content: string;
  is_hidden?: number;
  is_private?: number;
  source?: string;
  title?: string;
}

async function createItem(input: CreateInput): Promise<{ id: string }> {
  const req = await authedRequest("http://localhost/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: input.type ?? "note",
      content: input.content,
      is_hidden: input.is_hidden,
      is_private: input.is_private,
      source: input.source ?? "manual",
      title: input.title,
    }),
  });
  const res = await POST(req);
  expect(res.status).toBe(201);
  return res.json();
}

describe("two-level visibility (integration, /api/items)", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
    mockFetcher.mockReset();
    mockFetcher.mockResolvedValue({
      ok: false,
      reason: "no url in content",
      metadata: { url: "", fetched_at: new Date().toISOString() },
    });
  });

  afterEach(() => cleanupTestDb());

  describe("auth gating at the route layer", () => {
    it("GET /api/items returns 401 to an unauthenticated request", async () => {
      const req = anonRequest("http://localhost/api/items");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("GET /api/items?include_hidden=1 still returns 401 to an unauthenticated request (the opt-in is gated)", async () => {
      // An attacker cannot use the opt-in query string to bypass auth.
      const req = anonRequest(
        "http://localhost/api/items?include_hidden=1&include_private=1"
      );
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("POST /api/items returns 401 to an unauthenticated request, even with is_hidden:1 in the body", async () => {
      const req = anonRequest("http://localhost/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          content: "x",
          is_hidden: 1,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/items — visibility flag acceptance", () => {
    it("persists is_hidden from the body when set by the admin", async () => {
      const created = await createItem({
        content: "secret",
        is_hidden: 1,
      });
      // Direct read from the DB so the test does not depend on the
      // GET filter logic (which we cover elsewhere).
      const db = createTestDb();
      const row = db
        .prepare("SELECT is_hidden FROM content_items WHERE id = ?")
        .get(created.id) as { is_hidden: number };
      expect(row.is_hidden).toBe(1);
      db.close();
    });

    it("defaults is_hidden to 0 when the body omits it", async () => {
      const created = await createItem({ content: "plain" });
      const db = createTestDb();
      const row = db
        .prepare("SELECT is_hidden, is_private FROM content_items WHERE id = ?")
        .get(created.id) as { is_hidden: number; is_private: number };
      expect(row.is_hidden).toBe(0);
      expect(row.is_private).toBe(0);
      db.close();
    });

    it("rejects is_hidden values outside {0,1}", async () => {
      const req = await authedRequest("http://localhost/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          content: "x",
          is_hidden: 2,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/items — visibility opt-in", () => {
    it("excludes hidden and private rows by default", async () => {
      const a = await createItem({ content: "public note" });
      const b = await createItem({ content: "hidden note", is_hidden: 1 });
      const c = await createItem({
        content: "private note",
        is_private: 1,
      });

      const res = await GET(await authedRequest("http://localhost/api/items"));
      const json = await res.json();
      const ids = json.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(a.id);
      expect(ids).not.toContain(b.id);
      expect(ids).not.toContain(c.id);
      expect(json.total).toBe(1);
    });

    it("returns hidden rows when ?include_hidden=1 is passed by the admin", async () => {
      const a = await createItem({ content: "public note" });
      const b = await createItem({ content: "hidden note", is_hidden: 1 });
      const c = await createItem({
        content: "private note",
        is_private: 1,
      });

      const res = await GET(
        await authedRequest("http://localhost/api/items?include_hidden=1")
      );
      const json = await res.json();
      const ids = json.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(a.id);
      expect(ids).toContain(b.id);
      expect(ids).not.toContain(c.id);
    });

    it("returns private rows when ?include_private=1 is passed by the admin", async () => {
      const a = await createItem({ content: "public note" });
      const b = await createItem({ content: "hidden note", is_hidden: 1 });
      const c = await createItem({
        content: "private note",
        is_private: 1,
      });

      const res = await GET(
        await authedRequest("http://localhost/api/items?include_private=1")
      );
      const json = await res.json();
      const ids = json.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(a.id);
      expect(ids).not.toContain(b.id);
      expect(ids).toContain(c.id);
    });

    it("returns a row with both flags set only when both opt-ins are passed", async () => {
      const both = await createItem({
        content: "double-secret",
        is_hidden: 1,
        is_private: 1,
      });
      const visible = await createItem({ content: "public" });

      // Only hidden opt-in → both-set row still hidden.
      const onlyH = await GET(
        await authedRequest("http://localhost/api/items?include_hidden=1")
      );
      const onlyHIds = (await onlyH.json()).items.map(
        (i: { id: string }) => i.id
      );
      expect(onlyHIds).toContain(visible.id);
      expect(onlyHIds).not.toContain(both.id);

      // Only private opt-in → both-set row still hidden.
      const onlyP = await GET(
        await authedRequest("http://localhost/api/items?include_private=1")
      );
      const onlyPIds = (await onlyP.json()).items.map(
        (i: { id: string }) => i.id
      );
      expect(onlyPIds).toContain(visible.id);
      expect(onlyPIds).not.toContain(both.id);

      // Both opt-ins → both-set row is included.
      const bothFlags = await GET(
        await authedRequest(
          "http://localhost/api/items?include_hidden=1&include_private=1"
        )
      );
      const bothIds = (await bothFlags.json()).items.map(
        (i: { id: string }) => i.id
      );
      expect(bothIds).toContain(both.id);
      expect(bothIds).toContain(visible.id);
    });
  });
});

describe("two-level visibility (integration, /api/items/[id])", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
    mockFetcher.mockReset();
    mockFetcher.mockResolvedValue({
      ok: false,
      reason: "no url in content",
      metadata: { url: "", fetched_at: new Date().toISOString() },
    });
  });

  afterEach(() => cleanupTestDb());

  it("GET returns 401 to an unauthenticated request", async () => {
    const created = await createItem({ content: "x" });
    const res = await GET_BY_ID(
      anonRequest(`http://localhost/api/items/${created.id}`),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(401);
  });

  it("GET returns 404 for a hidden item when the admin did not opt in", async () => {
    const created = await createItem({ content: "secret", is_hidden: 1 });
    const res = await GET_BY_ID(
      await authedRequest(`http://localhost/api/items/${created.id}`),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(404);
  });

  it("GET returns the hidden item when ?include_hidden=1 is passed", async () => {
    const created = await createItem({ content: "secret", is_hidden: 1 });
    const res = await GET_BY_ID(
      await authedRequest(
        `http://localhost/api/items/${created.id}?include_hidden=1`
      ),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.id).toBe(created.id);
    expect(json.item.is_hidden).toBe(1);
  });

  it("GET returns the private item when ?include_private=1 is passed", async () => {
    const created = await createItem({
      content: "secret",
      is_private: 1,
    });
    const res = await GET_BY_ID(
      await authedRequest(
        `http://localhost/api/items/${created.id}?include_private=1`
      ),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.id).toBe(created.id);
    expect(json.item.is_private).toBe(1);
  });

  it("GET returns 404 for a both-set item unless both opt-ins are passed", async () => {
    const created = await createItem({
      content: "double",
      is_hidden: 1,
      is_private: 1,
    });

    const onlyH = await GET_BY_ID(
      await authedRequest(
        `http://localhost/api/items/${created.id}?include_hidden=1`
      ),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(onlyH.status).toBe(404);

    const onlyP = await GET_BY_ID(
      await authedRequest(
        `http://localhost/api/items/${created.id}?include_private=1`
      ),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(onlyP.status).toBe(404);

    const both = await GET_BY_ID(
      await authedRequest(
        `http://localhost/api/items/${created.id}?include_hidden=1&include_private=1`
      ),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(both.status).toBe(200);
  });

  it("PATCH updates is_hidden on an item", async () => {
    const created = await createItem({ content: "x" });
    const patchReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_hidden: 1 }),
      }
    );
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(patchRes.status).toBe(200);

    // After the patch, the default GET returns 404 (the row is now hidden).
    const defaultGet = await GET_BY_ID(
      await authedRequest(`http://localhost/api/items/${created.id}`),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(defaultGet.status).toBe(404);

    // With the opt-in, the row is returned and reports is_hidden=1.
    const optIn = await GET_BY_ID(
      await authedRequest(
        `http://localhost/api/items/${created.id}?include_hidden=1`
      ),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(optIn.status).toBe(200);
    const json = await optIn.json();
    expect(json.item.is_hidden).toBe(1);
  });

  it("PATCH returns 404 when the caller cannot see the row (no opt-in)", async () => {
    const created = await createItem({ content: "secret", is_hidden: 1 });
    const patchReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "new" }),
      }
    );
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(patchRes.status).toBe(404);
  });

  it("DELETE returns 404 for a hidden item when the admin did not opt in", async () => {
    const created = await createItem({ content: "secret", is_hidden: 1 });
    const delReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      { method: "DELETE" }
    );
    const delRes = await DELETE(delReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(delRes.status).toBe(404);

    // The row should still be there in the DB (DELETE was a no-op).
    const db = createTestDb();
    const row = db
      .prepare("SELECT id FROM content_items WHERE id = ?")
      .get(created.id);
    expect(row).toBeDefined();
    db.close();
  });

  it("DELETE succeeds when the admin opts in to see the hidden row", async () => {
    const created = await createItem({ content: "secret", is_hidden: 1 });
    const delReq = await authedRequest(
      `http://localhost/api/items/${created.id}?include_hidden=1`,
      { method: "DELETE" }
    );
    const delRes = await DELETE(delReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(delRes.status).toBe(200);
  });
});

describe("two-level visibility (integration, /api/search)", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => cleanupTestDb());

  it("excludes hidden and private rows by default", async () => {
    await createItem({ content: "public keyword", source: "manual" });
    await createItem({ content: "hidden keyword", is_hidden: 1 });
    await createItem({ content: "private keyword", is_private: 1 });

    const res = await SEARCH_GET(
      await authedRequest("http://localhost/api/search?q=keyword")
    );
    const json = await res.json();
    expect(json.total).toBe(1);
    expect(json.results[0].content).toBe("public keyword");
  });

  it("returns hidden rows when ?include_hidden=1 is passed", async () => {
    await createItem({ content: "public keyword" });
    await createItem({ content: "hidden keyword", is_hidden: 1 });

    const res = await SEARCH_GET(
      await authedRequest(
        "http://localhost/api/search?q=keyword&include_hidden=1"
      )
    );
    const json = await res.json();
    expect(json.total).toBe(2);
  });

  it("returns private rows when ?include_private=1 is passed", async () => {
    await createItem({ content: "public keyword" });
    await createItem({ content: "private keyword", is_private: 1 });

    const res = await SEARCH_GET(
      await authedRequest(
        "http://localhost/api/search?q=keyword&include_private=1"
      )
    );
    const json = await res.json();
    expect(json.total).toBe(2);
  });

  it("returns a 401 to an unauthenticated search request (the opt-in is gated)", async () => {
    const res = await SEARCH_GET(
      anonRequest(
        "http://localhost/api/search?q=keyword&include_hidden=1&include_private=1"
      )
    );
    expect(res.status).toBe(401);
  });
});
