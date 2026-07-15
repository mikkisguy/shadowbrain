import { z } from "zod";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import type { ThreadRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const stopSchema = z.object({
  threadId: z.string().min(1),
  content: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST /api/chat/messages/stop — persist partial assistant content after
// the user stops an in-flight stream.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }

    const parsed = parseJson(stopSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const { threadId, content } = parsed.data;
    const db = getDb();

    // Verify thread exists
    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(threadId) as ThreadRow | undefined;

    if (!thread) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }

    // Idempotency guard: if a partial assistant message with the
    // same content was already saved to this thread in the last
    // 5 seconds, return the existing id instead of inserting a
    // duplicate (client and server can race on an aborted stream).
    const recentDuplicate = db
      .prepare(
        `SELECT id, created_at FROM chat_messages
         WHERE thread_id = ? AND role = 'assistant' AND content = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(threadId, content) as { id: string; created_at: string } | undefined;
    if (recentDuplicate) {
      const createdAtMs = new Date(recentDuplicate.created_at).getTime();
      if (!Number.isNaN(createdAtMs) && Date.now() - createdAtMs < 5000) {
        return Response.json({
          id: recentDuplicate.id,
          createdAt: new Date(createdAtMs).toISOString(),
          duplicate: true,
        });
      }
    }

    // Persist the partial assistant message
    const asstMsgId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO chat_messages
         (id, thread_id, role, content, target_provider, target_model, created_at)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?)`
    ).run(
      asstMsgId,
      threadId,
      content,
      thread.target_provider,
      thread.target_model,
      now
    );

    // Touch thread timestamp
    db.prepare(`UPDATE chat_threads SET updated_at = ? WHERE id = ?`).run(
      now,
      threadId
    );

    return Response.json({ id: asstMsgId, createdAt: now });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/messages/stop",
      method: "POST",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
