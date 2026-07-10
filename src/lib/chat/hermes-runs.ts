import type Database from "better-sqlite3";
import http from "node:http";
import https from "node:https";
import { getSettingValue } from "@/lib/settings/public";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Normalised event types (the hub's SSE protocol toward the browser)
// ---------------------------------------------------------------------------

export type HermesApprovalDecision = "once" | "session" | "always" | "deny";

export type HermesSseEvent =
  | { type: "text-delta"; content: string }
  | {
      type: "tool-progress";
      tool: string;
      label: string;
      status: "running" | "completed";
    }
  | {
      type: "approval-requested";
      runId: string;
      summary: string;
      command?: string;
      /** Valid choices from Hermes (e.g. ["once", "session", "deny"]). */
      choices: HermesApprovalDecision[];
    }
  | { type: "done"; output?: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getHermesCredentials(db: Database.Database) {
  const baseUrl = (
    getSettingValue(db, "hermes_api_base") ?? "http://localhost:8642/v1"
  ).replace(/\/+$/, "");
  const apiKey = (getSettingValue(db, "hermes_api_key") ?? "").trim();
  return { baseUrl, apiKey };
}

const VALID_APPROVAL_CHOICES: HermesApprovalDecision[] = [
  "once",
  "session",
  "always",
  "deny",
];

function parseChoices(raw: unknown): HermesApprovalDecision[] {
  if (!Array.isArray(raw)) return [...VALID_APPROVAL_CHOICES];
  return raw.filter(
    (c): c is HermesApprovalDecision =>
      typeof c === "string" &&
      VALID_APPROVAL_CHOICES.includes(c as HermesApprovalDecision)
  );
}

// ---------------------------------------------------------------------------
// createRun
// ---------------------------------------------------------------------------

export interface CreateRunResult {
  runId: string;
}

/**
 * Create a new agent run on Hermes.
 *
 * The exact `POST /v1/runs` request body should be verified against the
 * running Hermes instance (`GET /v1/capabilities` then a trial `curl`).
 * The shape below follows the documented parameters (input, session_id,
 * conversation_history) and uses the OpenAI chat-message format for
 * conversation_history.
 */
export async function createRun(
  input: string,
  history: Array<{ role: string; content: string }>,
  threadId: string | null,
  db: Database.Database
): Promise<CreateRunResult> {
  const { baseUrl, apiKey } = getHermesCredentials(db);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body: Record<string, unknown> = { input };
  if (history.length > 0) body.conversation_history = history;
  if (threadId) body.session_id = threadId;

  const response = await fetch(`${baseUrl}/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Hermes createRun failed (${response.status}): ${text.slice(0, 500)}`
    );
  }

  const data = (await response.json()) as {
    run_id?: string;
    runId?: string;
  };
  const runId = data.run_id ?? data.runId;
  if (!runId) throw new Error("Hermes createRun returned no run_id");

  log("info", "Hermes run created", {
    event: "hermes.run.create",
    runId,
    threadId,
  });

  return { runId };
}

// ---------------------------------------------------------------------------
// Native HTTP GET (bypasses Next.js's patched global fetch)
// ---------------------------------------------------------------------------

/**
 * Minimal HTTP GET using Node's native module — bypasses Next.js's patched
 * global `fetch`, which kills in-flight requests after the route handler
 * returns. streamEvents is called inside ReadableStream.start() (the handler
 * has already returned the Response by then), so native HTTP is required.
 */
function nativeGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  text: () => Promise<string>;
}> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const chunks: Buffer[] = [];

    const req = mod.request(
      u,
      { method: "GET", headers, timeout: timeoutMs },
      (res) => {
        const ok = (res.statusCode ?? 500) < 400;
        const webStream = new ReadableStream<Uint8Array>({
          start(controller) {
            res.on("data", (chunk: Buffer) => {
              // Only buffer the full body for the !ok path (text() is
              // only called on error). Avoids accumulating the entire
              // 10-minute SSE stream in memory for successful runs.
              if (!ok) chunks.push(chunk);
              controller.enqueue(new Uint8Array(chunk));
            });
            res.on("end", () => controller.close());
            res.on("error", (err) => controller.error(err));
          },
          cancel() {
            res.destroy();
          },
        });

        resolve({
          ok,
          status: res.statusCode ?? 500,
          body: webStream,
          text: () => Promise.resolve(Buffer.concat(chunks).toString("utf-8")),
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${Date.now() - start}ms`));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// streamEvents
// ---------------------------------------------------------------------------

/**
 * Stream events from a Hermes run as an async generator of normalised events.
 *
 * Connects to Hermes's SSE endpoint (`GET /v1/runs/{run_id}/events`) and
 * maps Hermes event types to our UI protocol:
 *
 *   assistant.delta           → text-delta
 *   tool.started              → tool-progress (status: "running")
 *   tool.completed            → tool-progress (status: "completed")
 *   pending_approval          → approval-requested
 *   run.completed             → done
 */
export async function* streamEvents(
  runId: string,
  db: Database.Database
): AsyncGenerator<HermesSseEvent> {
  const { baseUrl, apiKey } = getHermesCredentials(db);

  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Awaited<ReturnType<typeof nativeGet>>;
  try {
    response = await nativeGet(
      `${baseUrl}/runs/${runId}/events`,
      headers,
      600_000 // 10 min
    );
  } catch (err) {
    log("error", "Hermes events stream connection failed", {
      event: "hermes.run.stream_connect_error",
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
    yield { type: "error", message: "Hermes stream connection failed" };
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    log("error", "Hermes events stream failed", {
      event: "hermes.run.stream_error",
      runId,
      status: response.status,
      body: text.slice(0, 500),
    });
    yield {
      type: "error",
      message: `Hermes events stream failed (${response.status})`,
    };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: "error", message: "No response body from Hermes" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEventType = "";

  // Track the first few raw payloads for diagnostics
  let rawSampleCount = 0;
  const RAW_SAMPLE_MAX = 3;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        // SSE event-type line
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        // Empty line resets the event type (end of SSE event)
        if (line.trim() === "") {
          currentEventType = "";
          continue;
        }

        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;

        // SSE end-of-stream marker — not JSON
        if (payload === "[DONE]") continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        // Determine the event type. Hermes puts the type in the `event`
        // field inside the JSON data (not in an SSE `event:` line).
        const eventType =
          currentEventType ||
          (parsed.event as string | undefined) ||
          (parsed.type as string | undefined) ||
          (parsed.object as string | undefined) ||
          "";

        switch (eventType) {
          case "assistant.delta":
          case "text-delta":
          case "message.delta":
            if (typeof parsed.delta === "string") {
              yield { type: "text-delta", content: parsed.delta };
            } else if (typeof parsed.content === "string") {
              yield { type: "text-delta", content: parsed.content };
            }
            break;

          case "chat.completion.chunk":
          case "chat.completion": {
            // Standard OpenAI Chat Completions SSE chunk — extract
            // delta.content from choices[0].delta.content
            const choices = parsed.choices as
              Array<{ delta?: { content?: string } }> | undefined;
            const content = choices?.[0]?.delta?.content;
            if (typeof content === "string") {
              yield { type: "text-delta", content };
            }
            break;
          }

          case "response.output_text.delta": {
            // OpenAI Responses API format: { delta: "..." }
            const delta = parsed.delta;
            if (typeof delta === "string") {
              yield { type: "text-delta", content: delta };
            }
            break;
          }

          case "reasoning.available":
            // Thinking/reasoning from reasoning models — the actual
            // response comes via message.delta events.  Silently skip.
            break;

          case "tool.started":
          case "hermes.tool.progress": {
            // Hermes sends: { tool, preview, ... }
            const toolName = String(parsed.tool ?? parsed.name ?? "unknown");
            const toolLabel = String(
              parsed.preview ?? parsed.label ?? parsed.input ?? toolName
            );
            yield {
              type: "tool-progress",
              tool: toolName,
              label: toolLabel,
              status: "running",
            };
            break;
          }

          case "tool.completed":
            // Hermes sends: { tool, duration, error, ... } — no content/label
            yield {
              type: "tool-progress",
              tool: String(parsed.tool ?? parsed.name ?? "unknown"),
              label:
                `completed in ${parsed.duration ?? "?"}s` +
                (parsed.error ? " (error)" : ""),
              status: "completed",
            };
            break;

          case "function_call":
          case "function_call_output":
            // OpenAI Responses API tool call — treat as tool-progress
            yield {
              type: "tool-progress",
              tool: String(parsed.name ?? "tool"),
              label: String(parsed.arguments ?? parsed.output ?? "").slice(
                0,
                200
              ),
              status:
                eventType === "function_call_output" ? "completed" : "running",
            };
            break;

          case "pending_approval":
          case "approval.requested":
          case "approval.request":
            yield {
              type: "approval-requested",
              runId,
              summary: String(
                parsed.description ??
                  parsed.summary ??
                  "Action requires approval"
              ),
              command:
                typeof parsed.command === "string" ? parsed.command : undefined,
              choices: parseChoices(parsed.choices),
            };
            break;

          case "run.completed":
          case "response.completed":
          case "response.done":
            yield {
              type: "done",
              output:
                typeof parsed.output === "string" ? parsed.output : undefined,
            };
            return;

          case "run.failed":
            yield {
              type: "error",
              message: String(parsed.error ?? "Run failed"),
            };
            return;

          case "run.cancelled":
            yield {
              type: "error",
              message: "Run was cancelled",
            };
            return;

          case "":
            // Empty event type — ignore (heartbeat or unrecognized marker)
            break;

          default: {
            // Log the raw payload for the first few unknown events so
            // we can identify the actual format and add support.
            if (rawSampleCount < RAW_SAMPLE_MAX) {
              rawSampleCount++;
              log("info", "Unknown Hermes run event (sample)", {
                event: "hermes.run.unknown_event",
                runId,
                eventType,
                sseEventLine: currentEventType || "(none)",
                keys: Object.keys(parsed),
                sample: payload.slice(0, 300),
              });
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    log("error", "Hermes events stream disconnected", {
      event: "hermes.run.stream_read_error",
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
    yield {
      type: "error",
      message: "Hermes stream disconnected",
    };
  } finally {
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// resolveApproval
// ---------------------------------------------------------------------------

/**
 * Resolve a pending approval for a Hermes run.
 *
 * POSTs to `POST /v1/runs/{run_id}/approval` with the decision.
 * Hermes resumes streaming events after the approval is recorded.
 */
export async function resolveApproval(
  runId: string,
  decision: HermesApprovalDecision,
  db: Database.Database
): Promise<void> {
  const { baseUrl, apiKey } = getHermesCredentials(db);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${baseUrl}/runs/${runId}/approval`, {
    method: "POST",
    headers,
    body: JSON.stringify({ choice: decision }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Hermes resolveApproval failed (${response.status}): ${text.slice(0, 500)}`
    );
  }

  log("info", "Hermes run approval resolved", {
    event: "hermes.run.approval_resolved",
    runId,
    decision,
  });
}
