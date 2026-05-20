import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET, POST } from "@/app/api/items/route";
import {
  GET as GET_BY_ID,
  PATCH,
  DELETE,
} from "@/app/api/items/[id]/route";

describe("/api/items", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("creates a content item", async () => {
    const req = new Request("http://localhost/api/items", {
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
    const createReq = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    await POST(createReq);

    const req = new Request("http://localhost/api/items?page=1&limit=20");
    const res = await GET(req);
    const json = await res.json();
    expect(json.items.length).toBeGreaterThan(0);
    expect(json.page).toBe(1);
    expect(json.limit).toBe(20);
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
    const req = new Request("http://localhost/api/items/does-not-exist");
    const res = await GET_BY_ID(req, {
      params: { id: "does-not-exist" },
    });
    expect(res.status).toBe(404);
  });

  it("updates an item", async () => {
    const createReq = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "hello", source: "web" }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const patchReq = new Request(`http://localhost/api/items/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "updated" }),
    });
    const patchRes = await PATCH(patchReq, { params: { id: created.id } });
    const patched = await patchRes.json();
    expect(patched.content).toBe("updated");
  });

  it("deletes an item", async () => {
    const createReq = new Request("http://localhost/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "bye", source: "web" }),
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const deleteReq = new Request(
      `http://localhost/api/items/${created.id}`,
      { method: "DELETE" }
    );
    const deleteRes = await DELETE(deleteReq, {
      params: { id: created.id },
    });
    expect(deleteRes.status).toBe(200);
  });
});
