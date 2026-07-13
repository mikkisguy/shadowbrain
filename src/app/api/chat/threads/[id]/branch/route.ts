import { z } from "zod";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import type { ThreadRow, MessageRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// POST /api/chat/threads/[id]/branch — fork thread from a message
// ---------------------------------------------------------------------------

const branchSchema = z.object({
  fromMessageId: z.string().min(1),
});

export async function POST(
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

    const parsed = parseJson(branchSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const { fromMessageId } = parsed.data;
    const db = getDb();

    // Load original thread
    const original = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(id) as ThreadRow | undefined;

    if (!original) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }

    // Load all messages for the original thread ordered by time
    const allMessages = db
      .prepare(
        "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC"
      )
      .all(id) as MessageRow[];

    // Find the cutoff index
    const cutoffIndex = allMessages.findIndex((m) => m.id === fromMessageId);
    if (cutoffIndex === -1) {
      return errorResponse(
        "NOT_FOUND",
        "Message not found in this thread",
        404
      );
    }

    // Messages to copy: all messages up to and including the cutoff
    const messagesToCopy = allMessages.slice(0, cutoffIndex + 1);
    const newThreadId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Build message ID map for stable remapping within the branch
    const idMap = new Map<string, string>();
    for (const msg of messagesToCopy) {
      idMap.set(msg.id, crypto.randomUUID());
    }

    // Use a transaction to insert thread + messages atomically
    const insertThread = db.prepare(
      `INSERT INTO chat_threads
         (id, title, target_provider, target_model, grounded, allow_model_save, include_private_in_ai, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMessage = db.prepare(
      `INSERT INTO chat_messages
         (id, thread_id, role, content, tool_calls, tool_call_id, target_provider, target_model, prompt_tokens, completion_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const transaction = db.transaction(() => {
      insertThread.run(
        newThreadId,
        `Branch: ${original.title}`,
        original.target_provider,
        original.target_model,
        original.grounded,
        original.allow_model_save,
        original.include_private_in_ai,
        now,
        now
      );

      for (const msg of messagesToCopy) {
        const newId = idMap.get(msg.id)!;
        insertMessage.run(
          newId,
          newThreadId,
          msg.role,
          msg.content,
          msg.tool_calls,
          msg.tool_call_id,
          msg.target_provider,
          msg.target_model,
          msg.prompt_tokens,
          msg.completion_tokens,
          msg.created_at
        );
      }
    });

    transaction();

    log("info", "chat thread branched", {
      event: "chat_thread.branch",
      originalId: id,
      newId: newThreadId,
      fromMessageId,
      messageCount: messagesToCopy.length,
    });

    const branched = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(newThreadId) as ThreadRow;

    return Response.json({ thread: branched }, { status: 201 });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/threads/[id]/branch",
      method: "POST",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
