import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { POST as CREATE_THREAD } from "@/app/api/chat/threads/route";
import { POST } from "@/app/api/chat/messages/stop/route";

describe("/api/chat/messages/stop", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("persists partial assistant content", async () => {
    // Create a thread
    const createReq = await authedRequest("http://localhost/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { provider: "opencode-go", model: "deepseek" },
      }),
    });
    const createRes = await CREATE_THREAD(createReq);
    const { thread } = await createRes.json();

    // Save partial content
    const stopReq = await authedRequest(
      "http://localhost/api/chat/messages/stop",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          content: "Partial response from AI",
        }),
      }
    );
    const stopRes = await POST(stopReq);
    expect(stopRes.status).toBe(200);
    const body = await stopRes.json();
    expect(body.id).toBeTruthy();
    expect(body.createdAt).toBeTruthy();

    // Verify message was persisted
    const { GET } = await import("@/app/api/chat/threads/[id]/route");
    const getReq = await authedRequest(
      `http://localhost/api/chat/threads/${thread.id}`
    );
    const getRes = await GET(getReq, {
      params: Promise.resolve({ id: thread.id }),
    });
    const json = await getRes.json();
    expect(json.messages).toHaveLength(1);
    expect(json.messages[0].role).toBe("assistant");
    expect(json.messages[0].content).toBe("Partial response from AI");
  });

  it("returns 404 for non-existent thread", async () => {
    const req = await authedRequest("http://localhost/api/chat/messages/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "nonexistent",
        content: "partial",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing content", async () => {
    const req = await authedRequest("http://localhost/api/chat/messages/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "anything",
        content: "",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing threadId", async () => {
    const req = await authedRequest("http://localhost/api/chat/messages/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "",
        content: "partial",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
