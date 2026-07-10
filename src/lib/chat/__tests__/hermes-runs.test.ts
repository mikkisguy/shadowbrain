import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import {
  createRun,
  streamEvents,
  resolveApproval,
} from "@/lib/chat/hermes-runs";
import type { HermesSseEvent } from "@/lib/chat/hermes-runs";

// ---------------------------------------------------------------------------
// Mock @/lib/settings/public — hoisted so vi.mock can reference the fn
// ---------------------------------------------------------------------------

const mockGetSettingValue = vi.hoisted(() => vi.fn());

vi.mock("@/lib/settings/public", () => ({
  getSettingValue: (...args: unknown[]) => mockGetSettingValue(...args),
}));

// ---------------------------------------------------------------------------
// Mock http.request (nativeGet uses node:http for long-lived SSE connections)
// ---------------------------------------------------------------------------

const mockHttpRequest = vi.hoisted(() => vi.fn());

vi.mock("node:http", () => ({
  default: {
    request: (...args: unknown[]) => mockHttpRequest(...args),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure the mocked http.request to simulate a native HTTP response
 * delivering SSE events. The mock fires `data` and `end` on the response
 * immediately when handlers are registered (inside ReadableStream.start()),
 * so the web stream is populated as soon as reader.read() is called.
 */
function mockHttpGetWithSse(
  events: Array<{ event?: string; data: Record<string, unknown> }>,
  statusCode = 200
): void {
  let body = "";
  for (const evt of events) {
    if (evt.event) body += `event: ${evt.event}\n`;
    body += `data: ${JSON.stringify(evt.data)}\n\n`;
  }
  const encoded = new TextEncoder().encode(body);

  mockHttpRequest.mockImplementation(
    (
      _url: unknown,
      _opts: unknown,
      callback: (res: Record<string, unknown>) => void
    ) => {
      const res = {
        statusCode,
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === "data") handler(Buffer.from(encoded));
          else if (event === "end") handler();
          return res;
        },
        destroy: vi.fn(),
      };
      callback(res);
      return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
    }
  );
}

/**
 * Configure the mocked http.request to simulate a connection error
 * on the response body (e.g. connection reset mid-stream).
 * The ReadableStream's error handler fires, causing reader.read() to reject.
 */
function mockHttpGetWithStreamError(errorMessage: string): void {
  mockHttpRequest.mockImplementation(
    (
      _url: unknown,
      _opts: unknown,
      callback: (res: Record<string, unknown>) => void
    ) => {
      const res = {
        statusCode: 200,
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === "error") handler(new Error(errorMessage));
          return res;
        },
        destroy: vi.fn(),
      };
      callback(res);
      return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
    }
  );
}

/** Collect all events from the async generator into an array. */
async function collectEvents(
  gen: AsyncGenerator<HermesSseEvent>
): Promise<HermesSseEvent[]> {
  const events: HermesSseEvent[] = [];
  for await (const evt of gen) {
    events.push(evt);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Shared test values
// ---------------------------------------------------------------------------

const mockDb = {} as unknown as Database.Database;

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSettingValue.mockImplementation((_db: unknown, key: string) => {
    if (key === "hermes_api_base") return "http://hermes.test/v1";
    if (key === "hermes_api_key") return "test-key";
    return undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// createRun
// ---------------------------------------------------------------------------

describe("createRun", () => {
  it("creates a run successfully with messages and threadId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ run_id: "run-123" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRun(
      "What is the capital of France?",
      [{ role: "user", content: "What is the capital of France?" }],
      "thread-456",
      mockDb
    );

    expect(result).toEqual({ runId: "run-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://hermes.test/v1/runs");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    expect(JSON.parse(opts.body)).toEqual({
      input: "What is the capital of France?",
      conversation_history: [
        { role: "user", content: "What is the capital of France?" },
      ],
      session_id: "thread-456",
    });
  });

  it("throws an error when Hermes returns a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal server error"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createRun("Hello", [], null, mockDb)).rejects.toThrow(
      "Hermes createRun failed (500): Internal server error"
    );
  });

  it("throws when response has no run_id field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createRun("Hello", [], null, mockDb)).rejects.toThrow(
      "Hermes createRun returned no run_id"
    );
  });

  it("accepts runId (camelCase) from the response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ runId: "run-789" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRun("Hello", [], null, mockDb);
    expect(result).toEqual({ runId: "run-789" });
  });
});

// ---------------------------------------------------------------------------
// streamEvents
// ---------------------------------------------------------------------------

describe("streamEvents", () => {
  it("normalises assistant.delta to text-delta", async () => {
    mockHttpGetWithSse([
      { event: "assistant.delta", data: { content: "Hello from the agent" } },
    ]);

    const events = await collectEvents(streamEvents("run-abc", mockDb));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "text-delta",
      content: "Hello from the agent",
    });
  });

  it("normalises tool.started and tool.completed to tool-progress", async () => {
    mockHttpGetWithSse([
      {
        event: "tool.started",
        data: { tool: "read_file", preview: "Reading file" },
      },
      {
        event: "tool.completed",
        data: { tool: "read_file", duration: 0.12, error: false },
      },
    ]);

    const events = await collectEvents(streamEvents("run-abc", mockDb));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "tool-progress",
      tool: "read_file",
      label: "Reading file",
      status: "running",
    });
    expect(events[1]).toEqual({
      type: "tool-progress",
      tool: "read_file",
      label: "completed in 0.12s",
      status: "completed",
    });
  });

  it("normalises pending_approval to approval-requested with command", async () => {
    mockHttpGetWithSse([
      {
        event: "pending_approval",
        data: {
          summary: "Allow the agent to run a shell command?",
          command: "rm -rf /tmp/test",
        },
      },
    ]);

    const events = await collectEvents(streamEvents("run-abc", mockDb));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "approval-requested",
      runId: "run-abc",
      summary: "Allow the agent to run a shell command?",
      command: "rm -rf /tmp/test",
      choices: ["once", "session", "always", "deny"],
    });
  });

  it("normalises run.completed to done and stops the generator", async () => {
    mockHttpGetWithSse([
      {
        event: "assistant.delta",
        data: { content: "Processing…" },
      },
      {
        event: "run.completed",
        data: { output: "Task finished successfully" },
      },
    ]);

    const events = await collectEvents(streamEvents("run-abc", mockDb));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "text-delta", content: "Processing…" });
    expect(events[1]).toEqual({
      type: "done",
      output: "Task finished successfully",
    });
  });

  it("handles run.failed as error and stops the generator", async () => {
    mockHttpGetWithSse([
      {
        event: "run.failed",
        data: { error: "Model rate limit exceeded" },
      },
    ]);

    const events = await collectEvents(streamEvents("run-abc", mockDb));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "error",
      message: "Model rate limit exceeded",
    });
  });

  it("yields an error when the HTTP response is not OK", async () => {
    mockHttpRequest.mockImplementation(
      (
        _url: unknown,
        _opts: unknown,
        callback: (res: Record<string, unknown>) => void
      ) => {
        const res = {
          statusCode: 502,
          on: vi.fn(),
          destroy: vi.fn(),
        };
        callback(res);
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
      }
    );

    const events = await collectEvents(streamEvents("run-abc", mockDb));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "error",
      message: "Hermes events stream failed (502)",
    });
  });

  it("yields error when reader throws during read", async () => {
    mockHttpGetWithStreamError("Connection reset by peer");

    const events = await collectEvents(streamEvents("run-abc", mockDb));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "error",
      message: "Hermes stream disconnected",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveApproval
// ---------------------------------------------------------------------------

describe("resolveApproval", () => {
  it("successfully POSTs an approve-once decision", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);

    await resolveApproval("run-abc", "once", mockDb);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://hermes.test/v1/runs/run-abc/approval");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    expect(JSON.parse(opts.body)).toEqual({ choice: "once" });
  });

  it("successfully POSTs a deny decision", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);

    await resolveApproval("run-xyz", "deny", mockDb);

    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ choice: "deny" });
  });

  it("throws an error when Hermes returns a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Invalid run state"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveApproval("run-abc", "once", mockDb)).rejects.toThrow(
      "Hermes resolveApproval failed (400): Invalid run state"
    );
  });
});
