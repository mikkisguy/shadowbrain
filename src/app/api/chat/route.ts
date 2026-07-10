import { z } from "zod";
import type { ModelMessage } from "ai";
import { streamText } from "ai";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { getModelForTarget } from "@/lib/chat/providers";
import { deriveTitle } from "@/lib/chat/title";
import { generateThreadTitle } from "@/lib/chat/title-generator";
import {
  createRun,
  streamEvents,
  resolveApproval,
} from "@/lib/chat/hermes-runs";
import type { MessageRow, Target } from "@/lib/chat/types";
import type { ToolProgressItem } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const chatRequestSchema = z
  .object({
    threadId: z.string().nullable().optional(),
    target: z
      .object({
        provider: z.enum(["hermes", "opencode-go"]),
        model: z.string().min(1),
      })
      .optional(),
    grounded: z.boolean().optional().default(false),
    allowModelSave: z.boolean().optional().default(false),
    message: z.string().optional(),
    temporary: z.boolean().optional().default(false),
    // Hermes approval resolution
    action: z.enum(["once", "session", "always", "deny"]).optional(),
    runId: z.string().optional(),
  })
  .refine(
    (data) =>
      (!!data.action && !!data.runId && !data.message && !data.target) ||
      (!data.action && !data.runId && !!data.message && !!data.target),
    {
      message: "Either (action + runId) or (message + target) is required",
    }
  );

// ---------------------------------------------------------------------------
// POST /api/chat — SSE streaming hub
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
  }

  const parsed = parseJson(chatRequestSchema, body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      issues: parsed.details,
    });
  }

  const db = getDb();
  const encoder = new TextEncoder();

  // ------------------------------------------------------------------
  // 0. Hermes approval resolution (fire-and-return)
  // ------------------------------------------------------------------
  if (parsed.data.action && parsed.data.runId) {
    try {
      await resolveApproval(parsed.data.runId, parsed.data.action, db);
      return Response.json({ ok: true });
    } catch (err) {
      logServerError(err, {
        route: "/api/chat",
        method: "POST",
        step: "resolveApproval",
        runId: parsed.data.runId,
      });
      return errorResponse(
        "APPROVAL_FAILED",
        "Failed to resolve approval",
        500
      );
    }
  }

  // Validation for non-approval requests
  if (!parsed.data.message) {
    return errorResponse("VALIDATION_ERROR", "message is required", 400);
  }

  // At this point the refine ensures both message and target exist
  const target = parsed.data.target!;
  const { threadId: incomingThreadId, message, temporary } = parsed.data;

  // ------------------------------------------------------------------
  // 1. Resolve thread (create if new persisted chat)
  // ------------------------------------------------------------------
  let threadId: string | null = incomingThreadId ?? null;

  if (!temporary && !threadId) {
    threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO chat_threads
         (id, title, target_provider, target_model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      threadId,
      deriveTitle(message),
      target.provider,
      target.model,
      now,
      now
    );
    log("info", "chat thread auto-created", {
      event: "chat_thread.create",
      id: threadId,
    });
  }

  // Validate that a client-provided threadId actually exists
  if (!temporary && threadId && incomingThreadId) {
    const exists = db
      .prepare("SELECT 1 FROM chat_threads WHERE id = ?")
      .get(threadId);
    if (!exists) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }
  }

  // ------------------------------------------------------------------
  // 2. Persist user message (persisted chats only)
  // ------------------------------------------------------------------
  if (!temporary && threadId) {
    const userMsgId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO chat_messages
         (id, thread_id, role, content, target_provider, target_model, created_at)
       VALUES (?, ?, 'user', ?, ?, ?, ?)`
    ).run(userMsgId, threadId, message, target.provider, target.model, now);

    // Touch the thread's updated_at
    db.prepare(`UPDATE chat_threads SET updated_at = ? WHERE id = ?`).run(
      now,
      threadId
    );
  }

  // ------------------------------------------------------------------
  // 3. Load history (persisted chats only)
  // ------------------------------------------------------------------
  const historyMessages: { role: string; content: string }[] = [];

  if (!temporary && threadId) {
    const rows = db
      .prepare(
        `SELECT role, content FROM chat_messages
         WHERE thread_id = ?
         ORDER BY created_at ASC`
      )
      .all(threadId) as Pick<MessageRow, "role" | "content">[];

    for (const row of rows) {
      historyMessages.push({ role: row.role, content: row.content });
    }
  }

  // For temporary chats, just send the current message.
  // For persisted chats, the user message is already in historyMessages.
  const modelMessages: ModelMessage[] = temporary
    ? [{ role: "user" as const, content: message }]
    : (historyMessages as ModelMessage[]);

  // ------------------------------------------------------------------
  // 4. Branch on target provider
  // ------------------------------------------------------------------

  if (target.provider === "hermes") {
    return handleHermesRun(
      db,
      encoder,
      message,
      historyMessages,
      threadId,
      target,
      temporary
    );
  }

  // OpenCode Go path — existing streamText flow
  return handleOpenCodeGoStream(
    db,
    encoder,
    modelMessages,
    threadId,
    target,
    temporary
  );
}

// ---------------------------------------------------------------------------
// Hermes Runs API path
// ---------------------------------------------------------------------------

async function handleHermesRun(
  db: ReturnType<typeof getDb>,
  encoder: TextEncoder,
  message: string,
  historyMessages: { role: string; content: string }[],
  threadId: string | null,
  target: Target,
  temporary: boolean
): Promise<Response> {
  let runId: string;

  try {
    const run = await createRun(
      message,
      // Pass the history up to (but not including) the user message we just
      // persisted, since Hermes's createRun already receives the current
      // input. For temporary chats the history is empty.
      temporary ? [] : historyMessages.slice(0, -1),
      threadId,
      db
    );
    runId = run.runId;
  } catch (err) {
    logServerError(err, {
      route: "/api/chat",
      method: "POST",
      step: "createRun",
      provider: "hermes",
    });
    const body = encoder.encode(
      `data: ${JSON.stringify({ type: "error", message: "Hermes not available" })}\n\n`
    );
    return new Response(body, {
      status: 200,
      headers: sseHeaders(),
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      const toolCalls: ToolProgressItem[] = [];

      try {
        for await (const event of streamEvents(runId, db)) {
          switch (event.type) {
            case "text-delta":
              fullContent += event.content;
              controller.enqueue(encoder.encode(sseFrame(event)));
              break;

            case "tool-progress": {
              const toolName = String(event.tool ?? "unknown");
              const existingIdx = toolCalls.findIndex(
                (tc) => tc.tool === toolName
              );
              const item: ToolProgressItem = {
                id: String(event.tool ?? "unknown"),
                tool: toolName,
                label: String(event.label ?? ""),
                status: event.status === "completed" ? "completed" : "running",
              };
              if (existingIdx >= 0) {
                toolCalls[existingIdx] = item;
              } else {
                toolCalls.push(item);
              }
              controller.enqueue(encoder.encode(sseFrame(event)));
              break;
            }

            case "approval-requested":
              controller.enqueue(encoder.encode(sseFrame(event)));
              break;

            case "done": {
              // If Hermes returned an output but no deltas, use it
              if (!fullContent && event.output) {
                fullContent = event.output;
              }

              // Persist assistant message
              if (!temporary && threadId) {
                const asstMsgId = crypto.randomUUID();
                const now = new Date().toISOString();
                db.prepare(
                  `INSERT INTO chat_messages
                     (id, thread_id, role, content, target_provider,
                      target_model, tool_calls, created_at)
                   VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`
                ).run(
                  asstMsgId,
                  threadId,
                  fullContent,
                  target.provider,
                  target.model,
                  toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
                  now
                );

                db.prepare(
                  `UPDATE chat_threads SET updated_at = ? WHERE id = ?`
                ).run(now, threadId);

                // Title generation after first exchange
                const msgCount = (
                  db
                    .prepare(
                      `SELECT COUNT(*) as c FROM chat_messages WHERE thread_id = ?`
                    )
                    .get(threadId) as { c: number }
                ).c;

                if (msgCount === 2) {
                  log("info", "triggering AI thread title generation", {
                    event: "chat_thread.title_trigger",
                    threadId,
                    msgCount,
                  });
                  generateThreadTitle(db, threadId).catch((err: unknown) => {
                    log("warn", "AI thread title generation failed", {
                      event: "chat_thread.title_generation_error",
                      threadId,
                      error: err instanceof Error ? err.message : String(err),
                    });
                  });
                }
              }

              controller.enqueue(
                encoder.encode(
                  sseFrame({
                    type: "done",
                    threadId,
                    promptTokens: null,
                    completionTokens: null,
                    output: event.output,
                  })
                )
              );
              controller.close();
              return;
            }

            case "error":
              controller.enqueue(encoder.encode(sseFrame(event)));
              break;
          }
        }
      } catch (err) {
        // Persist partial on error
        if (!temporary && threadId && fullContent.length > 0) {
          const asstMsgId = crypto.randomUUID();
          const now = new Date().toISOString();
          db.prepare(
            `INSERT INTO chat_messages
               (id, thread_id, role, content, target_provider,
                target_model, tool_calls, created_at)
             VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`
          ).run(
            asstMsgId,
            threadId,
            fullContent,
            target.provider,
            target.model,
            toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
            now
          );
        }

        logServerError(err, {
          route: "/api/chat",
          method: "POST",
          threadId,
          provider: "hermes",
        });

        controller.enqueue(
          encoder.encode(
            sseFrame({
              type: "error",
              message: "Stream error",
            })
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

// ---------------------------------------------------------------------------
// OpenCode Go path (existing streamText flow)
// ---------------------------------------------------------------------------

async function handleOpenCodeGoStream(
  db: ReturnType<typeof getDb>,
  encoder: TextEncoder,
  modelMessages: ModelMessage[],
  threadId: string | null,
  target: Target,
  temporary: boolean
): Promise<Response> {
  let model: ReturnType<typeof getModelForTarget>;
  try {
    model = getModelForTarget(db, target);
  } catch (err) {
    logServerError(err, {
      route: "/api/chat",
      method: "POST",
      step: "getModelForTarget",
    });
    const body = encoder.encode(
      `data: ${JSON.stringify({ type: "error", message: "Provider not available" })}\n\n`
    );
    return new Response(body, {
      status: 200,
      headers: sseHeaders(),
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let promptTokens: number | undefined;
      let completionTokens: number | undefined;

      try {
        const result = streamText({
          model,
          messages: modelMessages,
        });

        for await (const chunk of result.textStream) {
          fullContent += chunk;
          controller.enqueue(
            encoder.encode(sseFrame({ type: "text-delta", content: chunk }))
          );
        }

        // Await usage to get token counts
        try {
          const usage = await result.usage;
          promptTokens = usage.inputTokens;
          completionTokens = usage.outputTokens;
        } catch {
          // Usage may not be available from all providers
        }

        // Persist assistant message
        if (!temporary && threadId) {
          const asstMsgId = crypto.randomUUID();
          const now = new Date().toISOString();
          db.prepare(
            `INSERT INTO chat_messages
               (id, thread_id, role, content, target_provider, target_model,
                prompt_tokens, completion_tokens, created_at)
             VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`
          ).run(
            asstMsgId,
            threadId,
            fullContent,
            target.provider,
            target.model,
            promptTokens ?? null,
            completionTokens ?? null,
            now
          );

          db.prepare(`UPDATE chat_threads SET updated_at = ? WHERE id = ?`).run(
            now,
            threadId
          );

          // Title generation after first exchange
          const msgCount = (
            db
              .prepare(
                `SELECT COUNT(*) as c FROM chat_messages WHERE thread_id = ?`
              )
              .get(threadId) as { c: number }
          ).c;

          if (msgCount === 2) {
            log("info", "triggering AI thread title generation", {
              event: "chat_thread.title_trigger",
              threadId,
              msgCount,
            });
            generateThreadTitle(db, threadId).catch((err: unknown) => {
              log("warn", "AI thread title generation failed", {
                event: "chat_thread.title_generation_error",
                threadId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        }

        controller.enqueue(
          encoder.encode(
            sseFrame({
              type: "done",
              threadId,
              promptTokens,
              completionTokens,
            })
          )
        );
        controller.close();
      } catch (err) {
        // Persist partial response on error
        if (!temporary && threadId && fullContent.length > 0) {
          const asstMsgId = crypto.randomUUID();
          const now = new Date().toISOString();
          db.prepare(
            `INSERT INTO chat_messages
               (id, thread_id, role, content, target_provider, target_model,
                prompt_tokens, completion_tokens, created_at)
             VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`
          ).run(
            asstMsgId,
            threadId,
            fullContent,
            target.provider,
            target.model,
            promptTokens ?? null,
            completionTokens ?? null,
            now
          );
        }

        logServerError(err, {
          route: "/api/chat",
          method: "POST",
          threadId,
        });

        controller.enqueue(
          encoder.encode(sseFrame({ type: "error", message: "Stream error" }))
        );
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

function sseFrame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
