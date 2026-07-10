import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { POST } from "@/app/api/chat/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

vi.mock("@/lib/chat/providers", () => ({
  getModelForTarget: vi.fn(),
  listModels: vi.fn().mockResolvedValue([]),
}));

import { streamText } from "ai";
import { getModelForTarget } from "@/lib/chat/providers";

const mockStreamText = vi.mocked(streamText);
const mockGetModel = vi.mocked(getModelForTarget);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read all SSE events from a streaming Response body. */
async function readSseEvents(
  res: Response
): Promise<Array<Record<string, unknown>>> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No body reader available");

  const decoder = new TextDecoder();
  const events: Array<Record<string, unknown>> = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          events.push(JSON.parse(line.slice(6)));
        } catch {
          // skip
        }
      }
    }
  }

  return events;
}

/** Create a mock async iterable for textStream. */
function createMockTextStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("/api/chat", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
    mockStreamText.mockReset();
    mockGetModel.mockReset();
    // Default: return a dummy model that doesn't throw
    mockGetModel.mockReturnValue(
      {} as unknown as ReturnType<typeof getModelForTarget>
    );
  });

  afterEach(() => {
    cleanupTestDb();
  });

  describe("streaming", () => {
    it("streams token deltas as SSE events", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["Hello", " world"]),
      });

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "What is up?",
          temporary: false,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const events = await readSseEvents(res);
      expect(events).toHaveLength(3); // 2 deltas + 1 done

      expect(events[0]).toEqual({ type: "text-delta", content: "Hello" });
      expect(events[1]).toEqual({ type: "text-delta", content: " world" });
      expect(events[2].type).toBe("done");
      expect(events[2].threadId).toBeTruthy();
    });

    it("creates a thread on first message (persisted mode)", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["response"]),
      });

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "First message!",
          temporary: false,
        }),
      });

      const res = await POST(req);
      const events = await readSseEvents(res);
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.threadId).toBeTruthy();

      // Verify the thread was created in the DB
      const threadId = doneEvent?.threadId as string;
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const { GET } = await import("@/app/api/chat/threads/[id]/route");
      const getRes = await GET(getReq, {
        params: Promise.resolve({ id: threadId }),
      });
      const json = await getRes.json();
      expect(json.thread.title).toBe("First message!");
      expect(json.messages).toHaveLength(2); // user + assistant
      expect(json.messages[0].role).toBe("user");
      expect(json.messages[0].content).toBe("First message!");
      expect(json.messages[1].role).toBe("assistant");
      expect(json.messages[1].content).toBe("response");
    });

    it("persists messages for an existing thread", async () => {
      // First, create a thread and send one message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["first response"]),
      });

      const req1 = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "Message one",
          temporary: false,
        }),
      });

      const res1 = await POST(req1);
      const events1 = await readSseEvents(res1);
      const threadId = events1.find((e) => e.type === "done")
        ?.threadId as string;

      // Send second message on the same thread
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["second response"]),
      });

      const req2 = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "Message two",
          temporary: false,
        }),
      });

      await POST(req2);

      // Verify messages
      const { GET } = await import("@/app/api/chat/threads/[id]/route");
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const getRes = await GET(getReq, {
        params: Promise.resolve({ id: threadId }),
      });
      const json = await getRes.json();
      expect(json.messages).toHaveLength(4); // 2 user + 2 assistant
      expect(json.messages[2].content).toBe("Message two");
      expect(json.messages[3].content).toBe("second response");
    });

    it("does NOT persist when temporary: true", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["ephemeral"]),
      });

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "Temporary message",
          temporary: true,
        }),
      });

      const res = await POST(req);
      const events = await readSseEvents(res);
      const doneEvent = events.find((e) => e.type === "done");
      // threadId should be null for temporary chats
      expect(doneEvent?.threadId).toBeNull();

      // Get thread count — should be 0
      const { GET: getThreads } = await import("@/app/api/chat/threads/route");
      const listReq = await authedRequest("http://localhost/api/chat/threads");
      const listRes = await getThreads(listReq);
      const listJson = await listRes.json();
      expect(listJson.threads).toEqual([]);
    });

    it("returns error event when provider is not configured", async () => {
      mockGetModel.mockImplementation(() => {
        throw new Error("Provider not configured");
      });

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "test",
          temporary: false,
        }),
      });

      const res = await POST(req);
      const events = await readSseEvents(res);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "error",
        message: "Provider not available",
      });
    });

    it("truncates thread title to 80 characters", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["response"]),
      });

      const longMessage = "a".repeat(200);

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: longMessage,
          temporary: false,
        }),
      });

      const res = await POST(req);
      const events = await readSseEvents(res);
      const threadId = events.find((e) => e.type === "done")
        ?.threadId as string;

      const { GET } = await import("@/app/api/chat/threads/[id]/route");
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const getRes = await GET(getReq, {
        params: Promise.resolve({ id: threadId }),
      });
      const json = await getRes.json();
      expect(json.thread.title.length).toBeLessThanOrEqual(80);
    });
  });
});
