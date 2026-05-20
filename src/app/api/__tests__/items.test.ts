import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET, POST } from "@/app/api/items/route";

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
