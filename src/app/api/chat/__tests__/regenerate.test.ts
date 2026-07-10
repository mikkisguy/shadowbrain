import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest, cleanupTestDb, createTestDb } from "@/db/test-utils";
import { POST } from "@/app/api/chat/route";
import { POST as REGENERATE } from "@/app/api/chat/regenerate/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: vi.fn(),
  generateText: vi.fn().mockResolvedValue({ text: "" }),
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

describe("/api/chat/regenerate", () => {
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

  it("deletes last assistant message and creates new one", async () => {
    // Create a thread with a user + assistant exchange
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["first response"]),
      usage: Promise.resolve({
        inputTokens: 10,
        outputTokens: 5,
      }),
    });

    const req1 = await authedRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: null,
        target: { provider: "opencode-go", model: "deepseek" },
        message: "Hello",
        temporary: false,
      }),
    });
    const res1 = await POST(req1);
    const events1 = await readSseEvents(res1);
    const doneEvent = events1.find((e) => e.type === "done");
    const threadId = doneEvent?.threadId as string;
    expect(threadId).toBeTruthy();

    // Verify thread has 2 messages
    const { GET } = await import("@/app/api/chat/threads/[id]/route");
    const getReq1 = await authedRequest(
      `http://localhost/api/chat/threads/${threadId}`
    );
    const getRes1 = await GET(getReq1, {
      params: Promise.resolve({ id: threadId }),
    });
    const json1 = await getRes1.json();
    expect(json1.messages).toHaveLength(2);

    // Now regenerate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStreamText as any).mockReturnValue({
      textStream: createMockTextStream(["regenerated response"]),
      usage: Promise.resolve({
        inputTokens: 12,
        outputTokens: 8,
      }),
    });

    const regenReq = await authedRequest(
      "http://localhost/api/chat/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      }
    );
    const regenRes = await REGENERATE(regenReq);
    const regenEvents = await readSseEvents(regenRes);
    const regenDone = regenEvents.find((e) => e.type === "done");
    expect(regenDone).toBeTruthy();

    // Verify still 2 messages (old assistant deleted, new one created)
    const getReq2 = await authedRequest(
      `http://localhost/api/chat/threads/${threadId}`
    );
    const getRes2 = await GET(getReq2, {
      params: Promise.resolve({ id: threadId }),
    });
    const json2 = await getRes2.json();
    expect(json2.messages).toHaveLength(2);
    expect(json2.messages[0].role).toBe("user");
    expect(json2.messages[0].content).toBe("Hello");
    expect(json2.messages[1].role).toBe("assistant");
    expect(json2.messages[1].content).toBe("regenerated response");
  });

  it("returns 404 for unknown thread", async () => {
    const req = await authedRequest("http://localhost/api/chat/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: "nonexistent" }),
    });
    const res = await REGENERATE(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when thread has no assistant messages", async () => {
    // Create an empty thread (no messages)
    const { POST: CREATE_THREAD } =
      await import("@/app/api/chat/threads/route");
    const createReq = await authedRequest("http://localhost/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { provider: "opencode-go", model: "deepseek" },
      }),
    });
    const createRes = await CREATE_THREAD(createReq);
    const { thread } = await createRes.json();

    const regenReq = await authedRequest(
      "http://localhost/api/chat/regenerate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id }),
      }
    );
    const regenRes = await REGENERATE(regenReq);
    expect(regenRes.status).toBe(400);
  });
});
