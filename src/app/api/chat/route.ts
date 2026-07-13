import { z } from "zod";
import type { ModelMessage } from "ai";
import { streamText, tool } from "ai";
import { getDb, contentItems, contentTags } from "@/db/index";
import { tags } from "@/db/repositories/tags";
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
import { retrieveContext } from "@/lib/chat/retrieval";
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
    grounded: z.boolean().optional(),
    includePrivateInAi: z.boolean().optional(),
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
  const {
    threadId: incomingThreadId,
    message,
    temporary,
    grounded: reqGrounded,
    includePrivateInAi: reqIncludePrivate,
    allowModelSave,
  } = parsed.data;

  // ------------------------------------------------------------------
  // 1. Resolve thread (create if new persisted chat)
  // ------------------------------------------------------------------
  let threadId: string | null = incomingThreadId ?? null;

  if (!temporary && !threadId) {
    threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newGrounded = reqGrounded === true ? 1 : 0;
    db.prepare(
      `INSERT INTO chat_threads
         (id, title, target_provider, target_model, grounded,
          allow_model_save, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      threadId,
      deriveTitle(message),
      target.provider,
      target.model,
      newGrounded,
      allowModelSave ? 1 : 0,
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
  // 1b. Resolve thread settings for RAG grounding
  // ------------------------------------------------------------------
  let threadGrounded = 0;
  let threadIncludePrivate = 0;

  if (!temporary && threadId) {
    const threadRow = db
      .prepare(
        "SELECT grounded, include_private_in_ai FROM chat_threads WHERE id = ?"
      )
      .get(threadId) as
      { grounded: number; include_private_in_ai: number } | undefined;
    threadGrounded = threadRow?.grounded ?? 0;
    threadIncludePrivate = threadRow?.include_private_in_ai ?? 0;
  }

  // Request-level overrides take precedence; otherwise use thread setting.
  // Note: per-send overrides are ephemeral (affect only this message).
  // To change the thread's default, use PATCH /api/chat/threads/[id] (future).
  const effectiveGrounded = reqGrounded ?? threadGrounded === 1;
  const effectiveIncludePrivate =
    reqIncludePrivate ?? threadIncludePrivate === 1;

  // ------------------------------------------------------------------
  // 2. Persist user message (persisted chats only)
  // ------------------------------------------------------------------
  let userMsgId: string | undefined;
  if (!temporary && threadId) {
    userMsgId = crypto.randomUUID();
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
  // 3b. RAG grounding — retrieve context if grounded
  // ------------------------------------------------------------------
  let contextMessage: { role: "system"; content: string } | null = null;
  if (effectiveGrounded && message) {
    const contextBlock = retrieveContext(db, message, {
      includePrivate: effectiveIncludePrivate,
    });
    if (contextBlock) {
      contextMessage = { role: "system" as const, content: contextBlock };
    }
  }

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
      temporary,
      contextMessage,
      userMsgId
    );
  }

  // OpenCode Go path — existing streamText flow
  return handleOpenCodeGoStream(
    db,
    encoder,
    modelMessages,
    threadId,
    target,
    temporary,
    contextMessage,
    allowModelSave,
    userMsgId
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
  temporary: boolean,
  contextMessage: { role: "system"; content: string } | null,
  userMsgId: string | undefined
): Promise<Response> {
  let runId: string;

  try {
    // Build the history for Hermes, prepending RAG context if available
    const hermesHistory = temporary ? [] : historyMessages.slice(0, -1);
    if (contextMessage) {
      hermesHistory.unshift(contextMessage);
    }

    const run = await createRun(message, hermesHistory, threadId, db);
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
                (tc) => tc.tool === toolName && tc.status === "running"
              );
              const item: ToolProgressItem = {
                id:
                  existingIdx >= 0
                    ? toolCalls[existingIdx].id
                    : `${toolName}-${toolCalls.length}`,
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
              let asstMsgId: string | undefined;
              if (!temporary && threadId) {
                asstMsgId = crypto.randomUUID();
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
                    userMessageId: userMsgId ?? null,
                    assistantMessageId: asstMsgId ?? null,
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
  temporary: boolean,
  contextMessage: { role: "system"; content: string } | null,
  allowModelSave: boolean,
  userMsgId: string | undefined
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
        const saveTool = tool({
          description:
            "Save content into ShadowBrain's knowledge base. Creates a new content item that will be searchable.",
          inputSchema: z.object({
            type: z
              .string()
              .describe(
                "The content type: 'note', 'journal', 'bookmark', 'question', 'raw_text', or 'image'"
              ),
            content: z
              .string()
              .min(1)
              .describe("The full text content to save"),
            title: z
              .string()
              .optional()
              .describe("Optional title for the item"),
            tags: z
              .array(z.string())
              .optional()
              .describe("Optional list of tag names"),
          }),
          execute: async ({ type, content, title, tags: tagNames }) => {
            const now = new Date().toISOString();
            const id = crypto.randomUUID();

            contentItems.create(db, {
              id,
              type,
              title: title ?? null,
              content,
              source: "chat",
              created_at: now,
              updated_at: now,
            });

            if (tagNames && tagNames.length > 0) {
              for (const tagName of tagNames) {
                const normalized = tagName.trim();
                if (!normalized) continue;
                let existing = tags.findByName(db, normalized);
                if (!existing) {
                  const tagId = crypto.randomUUID();
                  tags.create(db, {
                    id: tagId,
                    name: normalized,
                    created_at: now,
                  });
                  existing = {
                    id: tagId,
                    name: normalized,
                    color: null,
                    created_at: now,
                  };
                }
                contentTags.addTag(db, id, existing.id, now);
              }
            }

            return {
              itemId: id,
              title: title ?? content.slice(0, 80),
              type,
            };
          },
        });

        const result = streamText({
          model,
          messages: modelMessages,
          ...(contextMessage ? { instructions: contextMessage.content } : {}),
          ...(allowModelSave
            ? {
                tools: { save_to_shadowbrain: saveTool },
                maxSteps: 2,
              }
            : {}),
        });

        if (allowModelSave) {
          // Iterate fullStream to detect tool results
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              fullContent += part.text;
              controller.enqueue(
                encoder.encode(
                  sseFrame({ type: "text-delta", content: part.text })
                )
              );
            } else if (part.type === "tool-result") {
              if (part.toolName === "save_to_shadowbrain") {
                const output = part.output as
                  { itemId: string; title: string; type: string } | undefined;
                if (output) {
                  controller.enqueue(
                    encoder.encode(
                      sseFrame({
                        type: "saved",
                        itemId: output.itemId,
                        title: output.title,
                        item_type: output.type,
                      })
                    )
                  );
                }
              }
            }
          }
        } else {
          // Original textStream iteration (no tools)
          for await (const chunk of result.textStream) {
            fullContent += chunk;
            controller.enqueue(
              encoder.encode(sseFrame({ type: "text-delta", content: chunk }))
            );
          }
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
        let asstMsgId: string | undefined;
        if (!temporary && threadId) {
          asstMsgId = crypto.randomUUID();
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
              userMessageId: userMsgId ?? null,
              assistantMessageId: asstMsgId ?? null,
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
