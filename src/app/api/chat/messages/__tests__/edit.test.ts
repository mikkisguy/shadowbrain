import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { POST } from "@/app/api/chat/route";
import { PATCH } from "@/app/api/chat/messages/[id]/route";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  generateText: vi.fn().mockResolvedValue({ text: "" }),
  tool: vi.fn(() => ({})),
}));

vi.mock("@/lib/chat/providers", () => ({
  getModelForTarget: vi.fn(),
  listModels: vi.fn().mockResolvedValue([]),
}));

import { streamText } from "ai";
import { getModelForTarget } from "@/lib/chat/providers";

const mockStreamText = vi.mocked(streamText);
const mockGetModel = vi.mocked(getModelForTarget);

function createMockTextStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

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

describe("/api/chat/messages/[id]", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
    mockStreamText.mockReset();
    mockGetModel.mockReset();
    mockGetModel.mockReturnValue(
      {} as unknown as ReturnType<typeof getModelForTarget>
    );
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("edits a user message, truncates thread, and regenerates", async () => {
    // Create a thread with a user + assistant exchange
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["Hello! How can I help?"]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    });

    const req1 = await authedRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: null,
        target: { provider: "opencode-go", model: "deepseek" },
        message: "Hi",
        temporary: false,
      }),
    });
    const res1 = await POST(req1);
    const events1 = await readSseEvents(res1);
    const doneEvent = events1.find((e) => e.type === "done");
    const threadId = doneEvent?.threadId as string;
    const userMessageId = doneEvent?.userMessageId as string;
    expect(threadId).toBeTruthy();
    expect(userMessageId).toBeTruthy();

    // Now edit the user message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["Revised response"]),
      usage: Promise.resolve({ inputTokens: 8, outputTokens: 3 }),
    });

    const editReq = await authedRequest(
      `http://localhost/api/chat/messages/${userMessageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Revised message",
          target: { provider: "opencode-go", model: "deepseek" },
        }),
      }
    );
    const editRes = await PATCH(editReq, {
      params: Promise.resolve({ id: userMessageId }),
    });
    expect(editRes.status).toBe(200);
    const editEvents = await readSseEvents(editRes);
    const editDone = editEvents.find((e) => e.type === "done");
    expect(editDone).toBeTruthy();

    // Verify thread now has 2 messages with updated content
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
    expect(json.messages[0].content).toBe("Revised message");
    expect(json.messages[1].role).toBe("assistant");
    expect(json.messages[1].content).toBe("Revised response");
  });

  it("returns 404 for non-existent message", async () => {
    const req = await authedRequest(
      "http://localhost/api/chat/messages/nonexistent",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "test",
          target: { provider: "opencode-go", model: "deepseek" },
        }),
      }
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when editing an assistant message", async () => {
    // Create a thread with user + assistant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["Response"]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
    });

    const req = await authedRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: null,
        target: { provider: "opencode-go", model: "deepseek" },
        message: "Hello",
        temporary: false,
      }),
    });
    const res = await POST(req);
    const events = await readSseEvents(res);
    const doneEvent = events.find((e) => e.type === "done");
    const assistantMessageId = doneEvent?.assistantMessageId as string;

    const editReq = await authedRequest(
      `http://localhost/api/chat/messages/${assistantMessageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "test",
          target: { provider: "opencode-go", model: "deepseek" },
        }),
      }
    );
    const editRes = await PATCH(editReq, {
      params: Promise.resolve({ id: assistantMessageId }),
    });
    expect(editRes.status).toBe(400);
  });

  it("deletes messages after the edited one", async () => {
    // Thread: user1 -> asst1 -> user2 -> asst2
    // After editing user1, asst1 + user2 + asst2 should all be deleted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["First response"]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    });

    let req = await authedRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: null,
        target: { provider: "opencode-go", model: "deepseek" },
        message: "First user",
        temporary: false,
      }),
    });
    let res = await POST(req);
    let events = await readSseEvents(res);
    const done1 = events.find((e) => e.type === "done");
    const threadId = done1?.threadId as string;
    const user1Id = done1?.userMessageId as string;

    // second exchange
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["Second response"]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    });

    req = await authedRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId,
        target: { provider: "opencode-go", model: "deepseek" },
        message: "Second user",
        temporary: false,
      }),
    });
    res = await POST(req);
    events = await readSseEvents(res);

    // Verify 4 messages exist
    const { GET } = await import("@/app/api/chat/threads/[id]/route");
    let getReq = await authedRequest(
      `http://localhost/api/chat/threads/${threadId}`
    );
    let getRes = await GET(getReq, {
      params: Promise.resolve({ id: threadId }),
    });
    let json = await getRes.json();
    expect(json.messages).toHaveLength(4);

    // Edit user1 — should truncate to just the edited user1 + new asst
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["Edited response"]),
      usage: Promise.resolve({ inputTokens: 8, outputTokens: 3 }),
    });

    const editReq = await authedRequest(
      `http://localhost/api/chat/messages/${user1Id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Edited first",
          target: { provider: "opencode-go", model: "deepseek" },
        }),
      }
    );
    const editRes = await PATCH(editReq, {
      params: Promise.resolve({ id: user1Id }),
    });
    await readSseEvents(editRes);

    getReq = await authedRequest(
      `http://localhost/api/chat/threads/${threadId}`
    );
    getRes = await GET(getReq, {
      params: Promise.resolve({ id: threadId }),
    });
    json = await getRes.json();
    expect(json.messages).toHaveLength(2);
    expect(json.messages[0].content).toBe("Edited first");
    expect(json.messages[1].role).toBe("assistant");
  });
});
