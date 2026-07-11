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

vi.mock("@/lib/chat/title-generator", () => ({
  generateThreadTitle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/chat/hermes-runs", () => ({
  createRun: vi.fn(),
  streamEvents: vi.fn(),
  resolveApproval: vi.fn(),
}));

vi.mock("@/lib/chat/retrieval", () => ({
  retrieveContext: vi.fn(),
}));

import { streamText } from "ai";
import { getModelForTarget } from "@/lib/chat/providers";

const mockStreamText = vi.mocked(streamText);
const mockGetModel = vi.mocked(getModelForTarget);

import {
  createRun,
  streamEvents,
  resolveApproval,
} from "@/lib/chat/hermes-runs";

const mockCreateRun = vi.mocked(createRun);
const mockStreamEvents = vi.mocked(streamEvents);
const mockResolveApproval = vi.mocked(resolveApproval);

import { retrieveContext } from "@/lib/chat/retrieval";
const mockRetrieveContext = vi.mocked(retrieveContext);

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
    mockCreateRun.mockReset();
    mockStreamEvents.mockReset();
    mockResolveApproval.mockReset();
    mockRetrieveContext.mockReset();
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

    it("tracks token usage from AI SDK and includes in done event", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["Hello"]),
        usage: Promise.resolve({
          inputTokens: 42,
          outputTokens: 10,
          totalTokens: 52,
        }),
      });

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "token test",
          temporary: false,
        }),
      });

      const res = await POST(req);
      const events = await readSseEvents(res);
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeTruthy();
      expect(doneEvent?.promptTokens).toBe(42);
      expect(doneEvent?.completionTokens).toBe(10);

      // Verify persisted in DB
      const threadId = doneEvent?.threadId as string;
      const { GET } = await import("@/app/api/chat/threads/[id]/route");
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const getRes = await GET(getReq, {
        params: Promise.resolve({ id: threadId }),
      });
      const json = await getRes.json();
      const assistantMsg = json.messages.find(
        (m: { role: string }) => m.role === "assistant"
      );
      expect(assistantMsg.prompt_tokens).toBe(42);
      expect(assistantMsg.completion_tokens).toBe(10);
    });

    it("persists messages with token counts null when usage unavailable", async () => {
      let rejectUsage: (err: Error) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["response"]),
        // usage Promise that rejects when awaited (lazy — avoids unhandled rejection)
        usage: new Promise((_, reject) => {
          rejectUsage = reject;
        }),
      });

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "no usage test",
          temporary: false,
        }),
      });

      const res = await POST(req);

      // Reject usage after the stream completes. The route awaits result.usage
      // after the textStream is exhausted; we need to reject so the done event
      // is sent (with tokens omitted).
      setTimeout(() => rejectUsage!(new Error("no usage")), 50);

      const events = await readSseEvents(res);
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeTruthy();
      // Still works — tokens are just null
      expect(doneEvent?.promptTokens).toBeUndefined();
      expect(doneEvent?.completionTokens).toBeUndefined();
    });
  });

  describe("Hermes Runs API", () => {
    it("Hermes target streams text via Runs API", async () => {
      mockCreateRun.mockResolvedValue({ runId: "run_123" });
      async function* hermesEvents() {
        yield { type: "text-delta" as const, content: "Hello" };
        yield { type: "text-delta" as const, content: " from Hermes" };
        yield { type: "done" as const };
      }
      mockStreamEvents.mockImplementation(() => hermesEvents());

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "hermes", model: "hermes-agent" },
          message: "Hello Hermes",
          temporary: true,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const events = await readSseEvents(res);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "text-delta", content: "Hello" });
      expect(events[1]).toEqual({
        type: "text-delta",
        content: " from Hermes",
      });
      expect(events[2].type).toBe("done");
      expect(events[2].threadId).toBeNull();
    });

    it("Hermes approval resolution succeeds", async () => {
      mockResolveApproval.mockResolvedValue(undefined);

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "once",
          runId: "run_123",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true });
    });

    it("Hermes approval resolution returns error on failure", async () => {
      mockResolveApproval.mockRejectedValue(new Error("Network failure"));

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "once",
          runId: "run_123",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error.code).toBe("APPROVAL_FAILED");
    });

    it("Hermes creates thread from first message", async () => {
      mockCreateRun.mockResolvedValue({ runId: "run_456" });
      async function* hermesEvents() {
        yield { type: "text-delta" as const, content: "Hello persisted" };
        yield { type: "done" as const };
      }
      mockStreamEvents.mockImplementation(() => hermesEvents());

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "hermes", model: "hermes-agent" },
          message: "Persist this",
          temporary: false,
        }),
      });

      const res = await POST(req);
      const events = await readSseEvents(res);
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.threadId).toBeTruthy();

      const threadId = doneEvent?.threadId as string;
      const { GET } = await import("@/app/api/chat/threads/[id]/route");
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const getRes = await GET(getReq, {
        params: Promise.resolve({ id: threadId }),
      });
      const json = await getRes.json();
      expect(json.messages).toHaveLength(2);
      expect(json.messages[0].role).toBe("user");
      expect(json.messages[0].content).toBe("Persist this");
      expect(json.messages[1].role).toBe("assistant");
      expect(json.messages[1].content).toBe("Hello persisted");
    });

    it("Hermes persists tool-progress events as tool_calls JSON", async () => {
      mockCreateRun.mockResolvedValue({ runId: "run_789" });
      async function* hermesEvents() {
        yield {
          type: "tool-progress" as const,
          tool: "read_file",
          label: "Reading /etc/hosts",
          status: "running" as const,
        };
        yield {
          type: "tool-progress" as const,
          tool: "read_file",
          label: "completed in 0.12s",
          status: "completed" as const,
        };
        yield {
          type: "tool-progress" as const,
          tool: "bash",
          label: "Running ls -la",
          status: "running" as const,
        };
        yield { type: "text-delta" as const, content: "Done reading" };
        yield { type: "done" as const };
      }
      mockStreamEvents.mockImplementation(() => hermesEvents());

      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          target: { provider: "hermes", model: "hermes-agent" },
          message: "Read files please",
          temporary: false,
        }),
      });

      const res = await POST(req);
      const events = await readSseEvents(res);
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.threadId).toBeTruthy();

      const threadId = doneEvent?.threadId as string;
      const { GET } = await import("@/app/api/chat/threads/[id]/route");
      const getReq = await authedRequest(
        `http://localhost/api/chat/threads/${threadId}`
      );
      const getRes = await GET(getReq, {
        params: Promise.resolve({ id: threadId }),
      });
      const json = await getRes.json();
      const assistantMsg = json.messages.find(
        (m: { role: string }) => m.role === "assistant"
      );
      expect(assistantMsg).toBeTruthy();
      expect(assistantMsg.tool_calls).toBeTruthy();
      const toolCalls = JSON.parse(assistantMsg.tool_calls);
      expect(Array.isArray(toolCalls)).toBe(true);
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].tool).toBe("read_file");
      expect(toolCalls[0].status).toBe("completed");
      expect(toolCalls[1].tool).toBe("bash");
      expect(toolCalls[1].status).toBe("running");
    });

    it("requires message when no action+runId provided", async () => {
      const req = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("RAG grounding", () => {
    it("grounded=true injects retrieved context via instructions for OpenCode Go", async () => {
      mockRetrieveContext.mockReturnValue(
        "## Retrieved context\n\n- **Test Item** (note): some content"
      );
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
          message: "What is RAG?",
          grounded: true,
          temporary: false,
        }),
      });

      const res = await POST(req);
      await readSseEvents(res);

      const callArgs = mockStreamText.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect((callArgs as { instructions?: string }).instructions).toBe(
        "## Retrieved context\n\n- **Test Item** (note): some content"
      );

      const messages = (callArgs as { messages: Array<unknown> }).messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: "user", content: "What is RAG?" });
    });

    it("grounded=false does not inject instructions or context", async () => {
      mockRetrieveContext.mockReturnValue(
        "## Retrieved context\n\n- **Another Item** (page): more content"
      );
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
          message: "No grounding please",
          grounded: false,
          temporary: false,
        }),
      });

      const res = await POST(req);
      await readSseEvents(res);

      expect(mockRetrieveContext).not.toHaveBeenCalled();

      const callArgs = mockStreamText.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      const instructions = (callArgs as { instructions?: string }).instructions;
      expect(instructions).toBeUndefined();

      const messages = (callArgs as { messages: Array<unknown> }).messages;
      const systemMessages = (messages as Array<{ role: string }>).filter(
        (m) => m.role === "system"
      );
      expect(systemMessages).toHaveLength(0);
    });

    it("empty retrieval result does not inject instructions", async () => {
      mockRetrieveContext.mockReturnValue(null);
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
          message: "Empty context test",
          grounded: true,
          temporary: false,
        }),
      });

      const res = await POST(req);
      await readSseEvents(res);

      const callArgs = mockStreamText.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      const instructions = (callArgs as { instructions?: string }).instructions;
      expect(instructions).toBeUndefined();

      const messages = (callArgs as { messages: Array<unknown> }).messages;
      const systemMessages = (messages as Array<{ role: string }>).filter(
        (m) => m.role === "system"
      );
      expect(systemMessages).toHaveLength(0);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: "user",
        content: "Empty context test",
      });
    });

    it("per-thread include_private_in_ai is passed to retrieval", async () => {
      // First, create a thread
      mockRetrieveContext.mockReturnValue(null);
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
          message: "First message",
          grounded: true,
          temporary: false,
        }),
      });

      const res1 = await POST(req1);
      const events1 = await readSseEvents(res1);
      const threadId = events1.find((e) => e.type === "done")
        ?.threadId as string;
      expect(threadId).toBeTruthy();

      // Update the thread's include_private_in_ai in the DB directly
      const { getDb } = await import("@/db/index");
      const db = getDb();
      db.prepare(
        "UPDATE chat_threads SET include_private_in_ai = 1 WHERE id = ?"
      ).run(threadId);

      // Second message: grounded already set on thread
      mockRetrieveContext.mockReturnValue(
        "## Retrieved context\n\n- **Private Item** (page): sensitive content"
      );
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
          message: "Show me private info",
          grounded: true,
          temporary: false,
        }),
      });

      const res2 = await POST(req2);
      await readSseEvents(res2);

      expect(mockRetrieveContext).toHaveBeenCalledWith(
        expect.anything(),
        "Show me private info",
        { includePrivate: true }
      );
    });

    it("per-send includePrivateInAi overrides thread setting", async () => {
      // First, create a thread (default include_private_in_ai = 0)
      mockRetrieveContext.mockReturnValue(null);
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
          message: "Create thread",
          grounded: true,
          temporary: false,
        }),
      });

      const res1 = await POST(req1);
      const events1 = await readSseEvents(res1);
      const threadId = events1.find((e) => e.type === "done")
        ?.threadId as string;
      expect(threadId).toBeTruthy();

      // Verify thread has include_private_in_ai = 0
      const { getDb } = await import("@/db/index");
      const db = getDb();
      const row = db
        .prepare("SELECT include_private_in_ai FROM chat_threads WHERE id = ?")
        .get(threadId) as { include_private_in_ai: number };
      expect(row.include_private_in_ai).toBe(0);

      // Second message with override
      mockRetrieveContext.mockReturnValue(
        "## Retrieved context\n\n- **Override Item** (page): override content"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStreamText as any).mockReturnValue({
        textStream: createMockTextStream(["override response"]),
      });

      const req2 = await authedRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          target: { provider: "opencode-go", model: "deepseek" },
          message: "Override private setting",
          grounded: true,
          includePrivateInAi: true,
          temporary: false,
        }),
      });

      const res2 = await POST(req2);
      await readSseEvents(res2);

      expect(mockRetrieveContext).toHaveBeenCalledWith(
        expect.anything(),
        "Override private setting",
        { includePrivate: true }
      );
    });
  });
});
