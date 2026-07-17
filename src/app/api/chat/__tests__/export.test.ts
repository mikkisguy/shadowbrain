import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET } from "@/app/api/chat/threads/[id]/export/route";
import { POST as POST_SAVE_TEMPORARY } from "@/app/api/chat/threads/save-temporary/route";

describe("/api/chat/threads/[id]/export", () => {
  let threadId: string;

  beforeEach(async () => {
    cleanupTestDb();
    createTestDb().close();

    // Create a thread with messages via save-temporary
    const saveReq = await authedRequest(
      "http://localhost/api/chat/threads/save-temporary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { provider: "opencode-go", model: "deepseek" },
          messages: [
            { role: "user", content: "Hello world" },
            {
              role: "assistant",
              content: "Hi! How can I help you today?",
            },
            { role: "user", content: "Tell me about the universe" },
            {
              role: "assistant",
              content: "The universe is vast and full of wonders.",
            },
          ],
        }),
      }
    );
    const saveRes = await POST_SAVE_TEMPORARY(saveReq);
    const json = await saveRes.json();
    threadId = json.thread.id;
  });

  afterEach(() => {
    cleanupTestDb();
  });

  describe("GET /api/chat/threads/[id]/export?format=markdown", () => {
    it("returns markdown content with content-disposition header", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}/export?format=markdown`
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: threadId }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("markdown");
      expect(res.headers.get("Content-Disposition")).toContain("attachment");

      const text = await res.text();
      expect(text).toContain("# ");
      expect(text).toContain("Hello world");
      expect(text).toContain("Hi! How can I help you today?");
      expect(text).toContain("### User");
      expect(text).toContain("### Assistant");
      expect(text).toContain("**Provider:** opencode-go");
      expect(text).toContain("**Model:** Deepseek");
    });

    it("includes timestamps in markdown", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}/export?format=markdown`
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: threadId }),
      });

      const text = await res.text();
      expect(text).toContain("**Created:**");
      expect(text).toContain("**Updated:**");
    });
  });

  describe("GET /api/chat/threads/[id]/export?format=json", () => {
    it("returns JSON content with all metadata", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}/export?format=json`
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: threadId }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      expect(res.headers.get("Content-Disposition")).toContain("attachment");

      const data = await res.json();
      expect(data.thread.id).toBe(threadId);
      expect(data.thread.provider).toBe("opencode-go");
      expect(data.thread.model).toBe("deepseek");
      expect(data.messages).toHaveLength(4);
      expect(data.messages[0].role).toBe("user");
      expect(data.messages[0].content).toBe("Hello world");
      expect(data.messages[1].role).toBe("assistant");
      expect(data.exportedAt).toBeTruthy();
    });

    it("includes token metadata when present", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}/export?format=json`
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: threadId }),
      });

      const data = await res.json();
      for (const msg of data.messages) {
        expect(msg).toHaveProperty("promptTokens");
        expect(msg).toHaveProperty("completionTokens");
        expect(msg).toHaveProperty("createdAt");
      }
    });
  });

  describe("GET /api/chat/threads/[id]/export default format", () => {
    it("defaults to markdown when no format specified", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}/export`
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: threadId }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("markdown");

      const text = await res.text();
      expect(text).toContain("Hello world");
    });
  });

  describe("error cases", () => {
    it("returns 404 for non-existent thread", async () => {
      const req = await authedRequest(
        "http://localhost/api/chat/threads/nonexistent/export?format=markdown"
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid format", async () => {
      const req = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}/export?format=xml`
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: threadId }),
      });
      expect(res.status).toBe(400);
    });
  });
});
