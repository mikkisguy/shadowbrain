import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET, POST } from "@/app/api/items/route";
import { GET as GET_BY_ID, PATCH, DELETE } from "@/app/api/items/[id]/route";
import { getDb } from "@/db/index";

// Mock the metadata fetcher so tests don't touch the network. Each test
// sets its own `fetchBookmarkMetadata` behaviour via the per-test
// `mockFetcher` mock below.
vi.mock("@/lib/metadata-fetcher", () => ({
  fetchBookmarkMetadata: vi.fn(),
}));

// Mock the storage module so tests don't touch the filesystem.
vi.mock("@/lib/storage", () => ({
  deleteImage: vi.fn().mockResolvedValue(true),
}));

// Imported lazily after the mock is registered so the route handler
// picks up the mocked implementation.
import { fetchBookmarkMetadata } from "@/lib/metadata-fetcher";
import { deleteImage } from "@/lib/storage";
const mockFetcher = vi.mocked(fetchBookmarkMetadata);
const mockDeleteImage = vi.mocked(deleteImage);

describe("/api/items", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
    mockFetcher.mockReset();
    // Default to a graceful no-op so unrelated tests don't accidentally
    // hit the network.
    mockFetcher.mockResolvedValue({
      ok: false,
      reason: "no url in content",
      metadata: { url: "", fetched_at: new Date().toISOString() },
    });
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("creates a content item", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("note");
    expect(json.content).toBe("hello");
  });

  it("returns paginated list", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    await POST(createReq);

    const req = await authedRequest(
      "http://localhost/api/items?page=1&limit=20"
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.items.length).toBeGreaterThan(0);
    expect(json.page).toBe(1);
    expect(json.limit).toBe(20);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("/api/items/[id]", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("returns 404 for missing item", async () => {
    const req = await authedRequest(
      "http://localhost/api/items/does-not-exist"
    );
    const res = await GET_BY_ID(req, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates an item", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const patchReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "updated" }),
      }
    );
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    const patched = await patchRes.json();
    expect(patched.item.content).toBe("updated");
  });

  it("clears title when set to null", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        content: "hello",
        source: "web",
        title: "to-clear",
      }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const patchReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: null }),
      }
    );
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    const patched = await patchRes.json();
    expect(patched.item.title).toBeNull();
  });

  it("updates type, source, and source_url", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const patchReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bookmark",
          source: "import",
          source_url: "https://example.com",
        }),
      }
    );
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    const patched = await patchRes.json();
    expect(patched.item.type).toBe("bookmark");
    expect(patched.item.source).toBe("import");
    expect(patched.item.source_url).toBe("https://example.com");
  });

  it("syncs tags: creates new tags and removes old ones", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    // Add initial tags
    const patchReq1 = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: ["tag1", "tag2"] }),
      }
    );
    await PATCH(patchReq1, { params: Promise.resolve({ id: created.id }) });

    // Replace tags with a different set
    const patchReq2 = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: ["tag2", "tag3"] }),
      }
    );
    const patchRes2 = await PATCH(patchReq2, {
      params: Promise.resolve({ id: created.id }),
    });
    const patched = await patchRes2.json();
    const tagNames = patched.tags.map((t: { name: string }) => t.name).sort();
    expect(tagNames).toEqual(["tag2", "tag3"]);
  });

  it("clears source_url when set to null", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        content: "https://example.com",
        source: "web",
        source_url: "https://example.com",
      }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const patchReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: null }),
      }
    );
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    const patched = await patchRes.json();
    expect(patched.item.source_url).toBeNull();
  });

  it("returns 400 for invalid JSON body", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const patchReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      }
    );
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(patchRes.status).toBe(400);
    const json = await patchRes.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("deletes an item", async () => {
    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "bye", source: "web" }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const deleteReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      { method: "DELETE" }
    );
    const deleteRes = await DELETE(deleteReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(deleteRes.status).toBe(200);
  });

  it("deletes the image file when deleting an image-type item", async () => {
    mockDeleteImage.mockClear();

    // Create an image-type item with an image_path
    const db = getDb();
    const now = new Date().toISOString();
    const id = "test-image-item";
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, image_path, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "image",
      "Test Image",
      "test content",
      "2026-07/test.webp",
      "web",
      now,
      now
    );

    const deleteReq = await authedRequest(`http://localhost/api/items/${id}`, {
      method: "DELETE",
    });
    const deleteRes = await DELETE(deleteReq, {
      params: Promise.resolve({ id }),
    });
    expect(deleteRes.status).toBe(200);

    // Verify deleteImage was called with the correct path
    expect(mockDeleteImage).toHaveBeenCalledWith("2026-07/test.webp");
  });

  it("does not call deleteImage when deleting a non-image item", async () => {
    mockDeleteImage.mockClear();

    const createReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        content: "not an image",
        source: "web",
      }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const deleteReq = await authedRequest(
      `http://localhost/api/items/${created.id}`,
      { method: "DELETE" }
    );
    const deleteRes = await DELETE(deleteReq, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(deleteRes.status).toBe(200);

    // Verify deleteImage was NOT called
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });

  it("deletes the image file when PATCH changes type away from image", async () => {
    mockDeleteImage.mockClear();

    // Create an image-type item with an image_path
    const db = getDb();
    const now = new Date().toISOString();
    const id = "test-image-item-patch";
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, image_path, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "image",
      "Test Image",
      "test content",
      "2026-07/test.webp",
      "web",
      now,
      now
    );

    const patchReq = await authedRequest(`http://localhost/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note" }),
    });
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id }),
    });
    expect(patchRes.status).toBe(200);

    // Verify deleteImage was called with the correct path
    expect(mockDeleteImage).toHaveBeenCalledWith("2026-07/test.webp");
  });

  it("does not delete image file when PATCH keeps type as image", async () => {
    mockDeleteImage.mockClear();

    const db = getDb();
    const now = new Date().toISOString();
    const id = "test-image-item-patch-keep";
    db.prepare(
      `INSERT INTO content_items (id, type, title, content, image_path, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "image",
      "Test Image",
      "test content",
      "2026-07/keep.webp",
      "web",
      now,
      now
    );

    const patchReq = await authedRequest(`http://localhost/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const patchRes = await PATCH(patchReq, {
      params: Promise.resolve({ id }),
    });
    expect(patchRes.status).toBe(200);

    // Verify deleteImage was NOT called (type didn't change)
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });
});

describe("/api/items bookmark auto-fetch", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
    mockFetcher.mockReset();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("stores fetched og:title / description / favicon in metadata", async () => {
    mockFetcher.mockResolvedValue({
      ok: true,
      metadata: {
        url: "https://example.com/article",
        title: "Real Title",
        description: "Real Desc",
        favicon: "https://example.com/f.ico",
        site_name: "Example",
        image: null,
        fetched_at: "2026-06-20T00:00:00.000Z",
      },
    });

    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        content: "https://example.com/article",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.type).toBe("bookmark");
    expect(json.source_url).toBe("https://example.com/article");
    // The item's title should be populated from the fetched og:title
    // when the user didn't provide one.
    expect(json.title).toBe("Real Title");
    const md = JSON.parse(json.metadata);
    expect(md.title).toBe("Real Title");
    expect(md.description).toBe("Real Desc");
    expect(md.favicon).toBe("https://example.com/f.ico");
    expect(md.url).toBe("https://example.com/article");
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it("uses user-provided title over fetched og:title for bookmarks", async () => {
    mockFetcher.mockResolvedValue({
      ok: true,
      metadata: {
        url: "https://example.com/article",
        title: "Fetched Title",
        description: null,
        favicon: null,
        site_name: null,
        image: null,
        fetched_at: "2026-06-20T00:00:00.000Z",
      },
    });

    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        content: "https://example.com/article",
        title: "User Title",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    // User-provided title should win over fetched og:title
    expect(json.title).toBe("User Title");
  });

  it("still saves the bookmark when the fetcher fails (graceful fallback)", async () => {
    mockFetcher.mockResolvedValue({
      ok: false,
      reason: "upstream 503",
      metadata: {
        url: "https://example.com/down",
        fetched_at: "2026-06-20T00:00:00.000Z",
      },
    });

    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        content: "https://example.com/down",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.type).toBe("bookmark");
    expect(json.source_url).toBe("https://example.com/down");
    // The fetch failure is recorded so the user can see "we tried".
    const md = JSON.parse(json.metadata);
    expect(md.auto_fetch).toEqual({
      status: "error",
      reason: "upstream 503",
      url: "https://example.com/down",
      fetched_at: "2026-06-20T00:00:00.000Z",
    });
  });

  it("records a generic reason (no hostnames leaked) when DNS fails", async () => {
    // The fetcher's DNS error messages must not include the hostname
    // the user requested — the security baseline says SSRF / DNS error
    // messages stay generic. The user knows what they typed; no
    // reason to echo it in the saved metadata.
    mockFetcher.mockResolvedValue({
      ok: false,
      reason: "DNS timeout",
      metadata: {
        url: "https://internal.example.com/",
        fetched_at: "2026-06-20T00:00:00.000Z",
      },
    });
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        content: "https://internal.example.com/",
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    const md = JSON.parse(json.metadata);
    expect(md.auto_fetch.reason).toBe("DNS timeout");
    expect(md.auto_fetch.reason).not.toMatch(/internal\.example/);
  });

  it("user-supplied metadata wins over auto-fetched fields", async () => {
    mockFetcher.mockResolvedValue({
      ok: true,
      metadata: {
        url: "https://example.com/article",
        title: "Auto Title",
        description: "Auto Desc",
        favicon: "https://example.com/auto.ico",
        site_name: null,
        image: null,
        fetched_at: "2026-06-20T00:00:00.000Z",
      },
    });

    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        content: "https://example.com/article",
        metadata: { title: "My Override", source: "manual" },
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    const md = JSON.parse(json.metadata);
    expect(md.title).toBe("My Override");
    expect(md.description).toBe("Auto Desc");
    expect(md.source).toBe("manual");
  });

  it("honours a user-supplied source_url instead of re-detecting", async () => {
    mockFetcher.mockResolvedValue({
      ok: true,
      metadata: {
        url: "https://other.example/",
        title: "X",
        description: null,
        favicon: null,
        site_name: null,
        image: null,
        fetched_at: "2026-06-20T00:00:00.000Z",
      },
    });

    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        content: "https://other.example/",
        source_url: "https://canonical.example/article",
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.source_url).toBe("https://canonical.example/article");
  });

  it("does not invoke the fetcher for non-bookmark types", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        content: "https://example.com",
      }),
    });
    await POST(req);
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it("saves a bookmark with no URL and no metadata", async () => {
    mockFetcher.mockResolvedValue({
      ok: false,
      reason: "no url in content",
      metadata: { url: "", fetched_at: new Date().toISOString() },
    });
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bookmark", content: "no link here" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("bookmark");
    expect(json.source_url).toBeNull();
    expect(json.metadata).toBeNull();
  });
});

describe("/api/items per-type metadata validation", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
    mockFetcher.mockReset();
    // Default to a graceful no-op so tests don't hit the network.
    mockFetcher.mockResolvedValue({
      ok: false,
      reason: "no url in content",
      metadata: { url: "", fetched_at: new Date().toISOString() },
    });
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("creates a person with valid metadata", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "person",
        content: "Sarah",
        metadata: {
          email: "sarah@example.com",
          social_links: ["https://github.com/sarah"],
          phone_number: "+1 555 0100",
          role: "DevOps lead",
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("person");
  });

  it("creates a person with no metadata (metadata is optional)", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "person",
        content: "Sarah",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("person");
  });

  it("rejects a person with wrong-typed metadata field (400 VALIDATION_ERROR)", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "person",
        content: "Sarah",
        metadata: { social_links: ["not-a-url"] },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a dream with valid metadata", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "dream",
        content: "flying",
        metadata: { mood: "surreal" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("dream");
  });

  it("rejects a dream with invalid mood type", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "dream",
        content: "flying",
        metadata: { mood: 123 },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates an event with null duration", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "event",
        content: "deploy",
        metadata: {
          start_date: "2026-04-12T09:30:00.000Z",
          end_date: "2026-04-12T11:15:00.000Z",
          duration: null,
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("event");
  });

  it("allows unknown metadata keys (passthrough)", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "project",
        content: "BranchForge",
        metadata: {
          status: "active",
          started: "2026-01-01T09:00:00.000Z",
          goal_end_date: "2026-12-31T18:00:00.000Z",
          future_field: "x",
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("project");
  });

  it("free-form metadata still allowed for untyped content (note)", async () => {
    const req = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        content: "hi",
        metadata: { anything: 1 },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("note");
  });
});

describe("/api/items cover-image resolution", () => {
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

  afterEach(() => {
    cleanupTestDb();
  });

  it("overrides image_path with the cover from linked image when listing items", async () => {
    // Create a source note with no image_path
    const noteReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        content: "source note",
        source: "manual",
      }),
    });
    const noteRes = await POST(noteReq);
    const note = await noteRes.json();

    // Create an image item
    const imageReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "image",
        content: "image content",
        source: "manual",
      }),
    });
    const imageRes = await POST(imageReq);
    const image = await imageRes.json();

    // Set the image_path directly (since POST doesn't accept it)
    const db = getDb();
    db.prepare("UPDATE content_items SET image_path = ? WHERE id = ?").run(
      "/cover.jpg",
      image.id
    );

    // Create a link from note to image
    const linkId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO content_links (id, source_id, target_id, link_type, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(linkId, note.id, image.id, "references", new Date().toISOString());

    // List items and verify cover resolution
    const listReq = await authedRequest("http://localhost/api/items");
    const listRes = await GET(listReq);
    const json = await listRes.json();

    const noteResult = json.items.find((i: { id: string }) => i.id === note.id);
    expect(noteResult).toBeDefined();
    expect(noteResult.image_path).toBe("/cover.jpg");
  });

  it("keeps the item's own image_path when there is no linked image", async () => {
    // Create a note
    const noteReq = await authedRequest("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        content: "source note",
        source: "manual",
      }),
    });
    const noteRes = await POST(noteReq);
    const note = await noteRes.json();

    // Set the image_path directly (since POST doesn't accept it)
    const db = getDb();
    db.prepare("UPDATE content_items SET image_path = ? WHERE id = ?").run(
      "/own.jpg",
      note.id
    );

    // List items and verify own image_path is kept
    const listReq = await authedRequest("http://localhost/api/items");
    const listRes = await GET(listReq);
    const json = await listRes.json();

    const noteResult = json.items.find((i: { id: string }) => i.id === note.id);
    expect(noteResult).toBeDefined();
    expect(noteResult.image_path).toBe("/own.jpg");
  });
});
