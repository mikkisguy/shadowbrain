import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { GET } from "@/app/api/chat/search/route";
import { POST } from "@/app/api/chat/threads/route";
import { POST as POST_SAVE_TEMPORARY } from "@/app/api/chat/threads/save-temporary/route";

describe("/api/chat/search", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  describe("GET /api/chat/search", () => {
    it("returns empty results for no query match", async () => {
      const req = await authedRequest(
        "http://localhost/api/chat/search?q=zzzznonexistent"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results).toEqual([]);
    });

    it("returns matching threads with message snippets", async () => {
      // Create a thread with messages
      const saveReq = await authedRequest(
        "http://localhost/api/chat/threads/save-temporary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: { provider: "opencode-go", model: "deepseek" },
            messages: [
              { role: "user", content: "What is the capital of France?" },
              {
                role: "assistant",
                content: "The capital of France is Paris.",
              },
            ],
          }),
        }
      );
      const saveRes = await POST_SAVE_TEMPORARY(saveReq);
      expect(saveRes.status).toBe(201);

      const req = await authedRequest(
        "http://localhost/api/chat/search?q=capital+france"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results.length).toBeGreaterThanOrEqual(1);
      expect(json.results[0].threadTitle).toBe(
        "What is the capital of France?"
      );
      expect(json.results[0].snippet).toContain("<mark>");
    });

    it("deduplicates: returns one result per thread", async () => {
      // Create thread where both user and assistant messages match
      const saveReq = await authedRequest(
        "http://localhost/api/chat/threads/save-temporary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: { provider: "opencode-go", model: "deepseek" },
            messages: [
              { role: "user", content: "Tell me about Python" },
              {
                role: "assistant",
                content: "Python is a programming language.",
              },
              { role: "user", content: "Python is great for web dev" },
              {
                role: "assistant",
                content: "Yes, Python has Django and Flask.",
              },
            ],
          }),
        }
      );
      const saveRes = await POST_SAVE_TEMPORARY(saveReq);
      expect(saveRes.status).toBe(201);

      const req = await authedRequest(
        "http://localhost/api/chat/search?q=Python"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      // Multiple messages match "Python" but only one result per thread
      expect(json.results.length).toBe(1);
    });

    it("returns 400 for missing query parameter", async () => {
      const req = await authedRequest("http://localhost/api/chat/search");
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty query", async () => {
      const req = await authedRequest("http://localhost/api/chat/search?q=");
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("respects the limit parameter", async () => {
      // Create 2 threads with unique searchable content
      const threadIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const saveReq = await authedRequest(
          "http://localhost/api/chat/threads/save-temporary",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target: { provider: "opencode-go", model: "deepseek" },
              messages: [
                {
                  role: "user",
                  content: `Thread ${i} unique search term foo bar`,
                },
              ],
            }),
          }
        );
        const r = await POST_SAVE_TEMPORARY(saveReq);
        const j = await r.json();
        threadIds.push(j.thread.id);
      }

      const req = await authedRequest(
        "http://localhost/api/chat/search?q=unique+search&limit=2"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results.length).toBeLessThanOrEqual(2);
    });

    it("returns results from multiple threads", async () => {
      const saveReq = await authedRequest(
        "http://localhost/api/chat/threads/save-temporary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: { provider: "opencode-go", model: "deepseek" },
            messages: [
              {
                role: "user",
                content: "Tell me about TypeScript interfaces",
              },
              {
                role: "assistant",
                content: "TypeScript interfaces define contracts.",
              },
            ],
          }),
        }
      );
      await POST_SAVE_TEMPORARY(saveReq);

      const saveReq2 = await authedRequest(
        "http://localhost/api/chat/threads/save-temporary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: { provider: "hermes", model: "hermes-agent" },
            messages: [
              {
                role: "user",
                content: "What is TypeScript used for?",
              },
              {
                role: "assistant",
                content: "TypeScript is a typed superset of JavaScript.",
              },
            ],
          }),
        }
      );
      await POST_SAVE_TEMPORARY(saveReq2);

      const req = await authedRequest(
        "http://localhost/api/chat/search?q=TypeScript"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results.length).toBe(2);
    });
  });
});
