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
import type { MessageRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const chatRequestSchema = z.object({
  threadId: z.string().nullable(),
  target: z.object({
    provider: z.enum(["hermes", "opencode-go"]),
    model: z.string().min(1),
  }),
  grounded: z.boolean().optional().default(false),
  allowModelSave: z.boolean().optional().default(false),
  message: z.string().min(1),
  temporary: z.boolean().optional().default(false),
});

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

  const {
    threadId: incomingThreadId,
    target,
    message,
    temporary,
  } = parsed.data;

  const db = getDb();
  const encoder = new TextEncoder();

  // ------------------------------------------------------------------
  // 1. Resolve thread (create if new persisted chat)
  // ------------------------------------------------------------------
  let threadId: string | null = incomingThreadId;

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
  // 4. Stream the response
  // ------------------------------------------------------------------
  let model: ReturnType<typeof getModelForTarget>;
  try {
    model = getModelForTarget(db, target);
  } catch (err) {
    // Provider not configured — log detail, return generic error as SSE
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
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
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
            encoder.encode(
              `data: ${JSON.stringify({ type: "text-delta", content: chunk })}\n\n`
            )
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

        // ------------------------------------------------------------------
        // 5. Persist assistant message (persisted chats only)
        // ------------------------------------------------------------------
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

          // ------------------------------------------------------------------
          // 6. AI-generated thread title after first exchange
          // ------------------------------------------------------------------
          const msgCount = (
            db
              .prepare(
                `SELECT COUNT(*) as c FROM chat_messages WHERE thread_id = ?`
              )
              .get(threadId) as { c: number }
          ).c;

          if (msgCount === 2) {
            // First exchange: attempt AI title generation.
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

        // Send done event with threadId and metadata
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              threadId,
              promptTokens,
              completionTokens,
            })}\n\n`
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
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
