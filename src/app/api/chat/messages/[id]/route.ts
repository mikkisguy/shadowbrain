import { z } from "zod";
import type { ModelMessage } from "ai";
import { streamText, tool } from "ai";
import { getDb, contentItems, contentTags } from "@/db/index";
import { tags } from "@/db/repositories/tags";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { getModelForTarget } from "@/lib/chat/providers";
import { retrieveContext } from "@/lib/chat/retrieval";
import type { MessageRow, ThreadRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const editSchema = z.object({
  content: z.string().min(1),
  target: z.object({
    provider: z.enum(["hermes", "opencode-go"]),
    model: z.string().min(1),
  }),
});

// ---------------------------------------------------------------------------
// SSE helpers (shared format with chat route)
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

// ---------------------------------------------------------------------------
// PATCH /api/chat/messages/[id] — edit a user message, truncate thread,
// and regenerate the assistant response via SSE.
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }

    const parsed = parseJson(editSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const { content: newContent, target } = parsed.data;
    const db = getDb();

    // 1. Look up the message — must be a user message
    const msg = db
      .prepare("SELECT * FROM chat_messages WHERE id = ?")
      .get(id) as MessageRow | undefined;

    if (!msg) {
      return errorResponse("NOT_FOUND", "Message not found", 404);
    }

    if (msg.role !== "user") {
      return errorResponse(
        "VALIDATION_ERROR",
        "Only user messages can be edited",
        400
      );
    }

    const threadId = msg.thread_id;

    // Verify thread exists
    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(threadId) as ThreadRow | undefined;
    if (!thread) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }

    // Hermes threads are not supported for editing yet.
    if (thread.target_provider === "hermes") {
      return errorResponse(
        "VALIDATION_ERROR",
        "Hermes threads are not supported for editing yet",
        400
      );
    }

    // 2. Update the user message content
    const now = new Date().toISOString();
    db.prepare("UPDATE chat_messages SET content = ? WHERE id = ?").run(
      newContent,
      id
    );

    // 3. Delete all messages after the edited message.
    // Use rowid for deterministic truncation (created_at can collide).
    db.prepare(
      `DELETE FROM chat_messages
       WHERE thread_id = ? AND rowid > (SELECT rowid FROM chat_messages WHERE id = ?)`
    ).run(threadId, id);

    // 4. Load the remaining history (up to and including the edited message)
    const rows = db
      .prepare(
        `SELECT role, content FROM chat_messages
         WHERE thread_id = ?
         ORDER BY created_at ASC`
      )
      .all(threadId) as Pick<MessageRow, "role" | "content">[];

    const historyMessages: ModelMessage[] = rows.map((row) => ({
      role: row.role as ModelMessage["role"],
      content: row.content,
    })) as ModelMessage[];

    // 5. Load thread settings for RAG grounding
    const effectiveGrounded = thread.grounded === 1;
    const effectiveIncludePrivate = thread.include_private_in_ai === 1;

    // 6. RAG context if grounded
    let instructions: string | undefined;
    if (effectiveGrounded && newContent) {
      const contextBlock = retrieveContext(db, newContent, {
        includePrivate: effectiveIncludePrivate,
      });
      if (contextBlock) {
        instructions = contextBlock;
      }
    }

    // 7. Touch thread timestamp
    db.prepare(`UPDATE chat_threads SET updated_at = ? WHERE id = ?`).run(
      now,
      threadId
    );

    // 8. Stream the new assistant response
    const encoder = new TextEncoder();

    let model: ReturnType<typeof getModelForTarget>;
    try {
      model = getModelForTarget(db, target);
    } catch (err) {
      logServerError(err, {
        route: "/api/chat/messages/[id]",
        method: "PATCH",
        step: "getModelForTarget",
      });
      const body = encoder.encode(
        sseFrame({ type: "error", message: "Provider not available" })
      );
      return new Response(body, { status: 200, headers: sseHeaders() });
    }

    // Build the system message for RAG
    const modelMessages: ModelMessage[] = instructions
      ? [{ role: "system" as const, content: instructions }, ...historyMessages]
      : historyMessages;

    const allowModelSave = thread.allow_model_save === 1;

    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        let promptTokens: number | undefined;
        let completionTokens: number | undefined;

        try {
          const saveTool = tool({
            description: "Save content into ShadowBrain's knowledge base.",
            inputSchema: z.object({
              type: z.string(),
              content: z.string().min(1),
              title: z.string().optional(),
              tags: z.array(z.string()).optional(),
            }),
            execute: async ({
              type,
              content: itemContent,
              title,
              tags: tagNames,
            }) => {
              const now2 = new Date().toISOString();
              const itemId = crypto.randomUUID();
              contentItems.create(db, {
                id: itemId,
                type,
                title: title ?? null,
                content: itemContent,
                source: "chat",
                created_at: now2,
                updated_at: now2,
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
                      created_at: now2,
                    });
                    existing = {
                      id: tagId,
                      name: normalized,
                      color: null,
                      created_at: now2,
                    };
                  }
                  contentTags.addTag(db, itemId, existing.id, now2);
                }
              }
              return { itemId, title: title ?? itemContent.slice(0, 80), type };
            },
          });

          const result = streamText({
            model,
            messages: modelMessages,
            ...(allowModelSave
              ? { tools: { save_to_shadowbrain: saveTool }, maxSteps: 2 }
              : {}),
          });

          if (allowModelSave) {
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
            for await (const chunk of result.textStream) {
              fullContent += chunk;
              controller.enqueue(
                encoder.encode(sseFrame({ type: "text-delta", content: chunk }))
              );
            }
          }

          try {
            const usage = await result.usage;
            promptTokens = usage.inputTokens;
            completionTokens = usage.outputTokens;
          } catch {
            // Usage may not be available
          }

          // Persist assistant message
          const asstMsgId = crypto.randomUUID();
          const now2 = new Date().toISOString();
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
            now2
          );

          db.prepare(`UPDATE chat_threads SET updated_at = ? WHERE id = ?`).run(
            now2,
            threadId
          );

          controller.enqueue(
            encoder.encode(
              sseFrame({
                type: "done",
                threadId,
                userMessageId: id,
                assistantMessageId: asstMsgId,
                promptTokens,
                completionTokens,
              })
            )
          );
          controller.close();
        } catch (err) {
          if (fullContent.length > 0) {
            const asstMsgId = crypto.randomUUID();
            const now2 = new Date().toISOString();
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
              now2
            );
          }

          logServerError(err, {
            route: "/api/chat/messages/[id]",
            method: "PATCH",
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
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/messages/[id]",
      method: "PATCH",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
