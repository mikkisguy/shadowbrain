import { z } from "zod";
import type { ModelMessage } from "ai";
import { streamText } from "ai";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { getModelForTarget } from "@/lib/chat/providers";
import type { MessageRow, ThreadRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const regenerateSchema = z.object({
  threadId: z.string().min(1),
  target: z
    .object({
      provider: z.string().min(1),
      model: z.string().min(1),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /api/chat/regenerate — retry last assistant message
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

  const parsed = parseJson(regenerateSchema, body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      issues: parsed.details,
    });
  }

  const { threadId, target: clientTarget } = parsed.data;
  const db = getDb();

  // Validate thread exists
  const thread = db
    .prepare("SELECT * FROM chat_threads WHERE id = ?")
    .get(threadId) as ThreadRow | undefined;
  if (!thread) {
    return errorResponse("NOT_FOUND", "Thread not found", 404);
  }

  // Find and delete the last assistant message
  const lastAssistant = db
    .prepare(
      `SELECT id FROM chat_messages
       WHERE thread_id = ? AND role = 'assistant'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(threadId) as { id: string } | undefined;

  if (!lastAssistant) {
    return errorResponse(
      "VALIDATION_ERROR",
      "No assistant message to regenerate",
      400
    );
  }

  db.prepare("DELETE FROM chat_messages WHERE id = ?").run(lastAssistant.id);

  // Load history (last message should be the user's)
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

  // Use client-supplied target if provided, otherwise fall back to thread's
  const target = clientTarget
    ? {
        provider: clientTarget.provider as "hermes" | "opencode-go",
        model: clientTarget.model,
      }
    : {
        provider: thread.target_provider as "hermes" | "opencode-go",
        model: thread.target_model,
      };

  let model: ReturnType<typeof getModelForTarget>;
  try {
    model = getModelForTarget(db, target);
  } catch (err) {
    logServerError(err, {
      route: "/api/chat/regenerate",
      method: "POST",
      step: "getModelForTarget",
    });
    const encoder = new TextEncoder();
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let promptTokens: number | undefined;
      let completionTokens: number | undefined;

      try {
        const result = streamText({
          model,
          messages: historyMessages,
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

        // Persist new assistant message
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

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              threadId,
              assistantMessageId: asstMsgId,
              promptTokens,
              completionTokens,
            })}\n\n`
          )
        );
        controller.close();
      } catch (err) {
        // Persist partial response on error
        if (fullContent.length > 0) {
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
          route: "/api/chat/regenerate",
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
