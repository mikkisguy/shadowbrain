import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET, POST } from "@/app/api/chat/threads/route";
import {
  GET as GET_BY_ID,
  PATCH,
  DELETE,
} from "@/app/api/chat/threads/[id]/route";
import { POST as POST_SAVE_TEMPORARY } from "@/app/api/chat/threads/save-temporary/route";

describe("/api/chat/threads", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  describe("POST /api/chat/threads", () => {
    it("creates a thread with default title", async () => {
      const req = await authedRequest("http://localhost/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider: "opencode-go", model: "deepseek" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.thread.title).toBe("New Chat");
      expect(json.thread.target_provider).toBe("opencode-go");
      expect(json.thread.target_model).toBe("deepseek");
    });

    it("creates a thread with a custom title", async () => {
      const req = await authedRequest("http://localhost/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider: "hermes", model: "hermes-agent" },
          title: "My custom thread",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.thread.title).toBe("My custom thread");
    });

    it("returns 400 for missing target.model", async () => {
      const req = await authedRequest("http://localhost/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider: "opencode-go" },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/chat/threads", () => {
    it("lists threads ordered by updated_at desc", async () => {
      // Create two threads
      const req1 = await authedRequest("http://localhost/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider: "opencode-go", model: "deepseek" },
          title: "First",
        }),
      });
      await POST(req1);

      const req2 = await authedRequest("http://localhost/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider: "hermes", model: "hermes-agent" },
          title: "Second",
        }),
      });
      await POST(req2);

      const req = await authedRequest("http://localhost/api/chat/threads");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.threads).toHaveLength(2);
      expect(json.threads[0].title).toBe("Second"); // newest first
    });

    it("returns empty list when no threads exist", async () => {
      const req = await authedRequest("http://localhost/api/chat/threads");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.threads).toEqual([]);
    });
  });

  describe("/api/chat/threads/[id]", () => {
    let threadId: string;

    beforeEach(async () => {
      const req = await authedRequest("http://localhost/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider: "opencode-go", model: "deepseek" },
          title: "Test thread",
        }),
      });
      const res = await POST(req);
      const json = await res.json();
      threadId = json.thread.id;
    });

    it("gets a thread with no messages", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const res = await GET_BY_ID(req, {
        params: Promise.resolve({ id: threadId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.thread.id).toBe(threadId);
      expect(json.messages).toEqual([]);
    });

    it("renames a thread", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Renamed thread" }),
        }
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: threadId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.thread.title).toBe("Renamed thread");
    });

    it("deletes a thread", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`,
        { method: "DELETE" }
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: threadId }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      // Verify it's gone
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const getRes = await GET_BY_ID(getReq, {
        params: Promise.resolve({ id: threadId }),
      });
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for unknown thread", async () => {
      const req = await authedRequest(
        "http://localhost/api/chat/threads/nonexistent"
      );
      const res = await GET_BY_ID(req, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/chat/threads/save-temporary", () => {
    it("saves a temporary chat with messages", async () => {
      const req = await authedRequest(
        "http://localhost/api/chat/threads/save-temporary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: { provider: "opencode-go", model: "deepseek" },
            messages: [
              { role: "user", content: "Hello" },
              { role: "assistant", content: "Hi there!" },
            ],
          }),
        }
      );

      const res = await POST_SAVE_TEMPORARY(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.thread.id).toBeTruthy();

      // Verify messages were persisted
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${json.thread.id}`
      );
      const getRes = await GET_BY_ID(getReq, {
        params: Promise.resolve({ id: json.thread.id }),
      });
      const getJson = await getRes.json();
      expect(getJson.messages).toHaveLength(2);
      expect(getJson.messages[0].content).toBe("Hello");
      expect(getJson.messages[1].content).toBe("Hi there!");
    });

    it("derives title from first user message", async () => {
      const req = await authedRequest(
        "http://localhost/api/chat/threads/save-temporary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: { provider: "opencode-go", model: "deepseek" },
            messages: [
              { role: "user", content: "What is the meaning of life?" },
              { role: "assistant", content: "42" },
            ],
          }),
        }
      );

      const res = await POST_SAVE_TEMPORARY(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.thread.title).toBe("What is the meaning of life?");
    });
  });
});
