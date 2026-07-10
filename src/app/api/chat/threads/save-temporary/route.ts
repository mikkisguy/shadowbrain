import { z } from "zod";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { deriveTitle } from "@/lib/chat/title";
import type { ThreadRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// POST /api/chat/threads/save-temporary
//
// Accepts a temporary thread's full message history from the client,
// creates the chat_threads row, bulk-inserts chat_messages, returns
// the new thread id.
// ---------------------------------------------------------------------------

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
});

const saveTemporarySchema = z.object({
  target: z.object({
    provider: z.enum(["hermes", "opencode-go"]),
    model: z.string().min(1),
  }),
  messages: z.array(messageSchema).min(1),
  title: z.string().min(1).optional(),
});

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

    const parsed = parseJson(saveTemporarySchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const { target, messages, title } = parsed.data;
    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Derive title from first user message if not provided
    const derivedTitle = title
      ? deriveTitle(title) || "New Chat"
      : deriveTitle(messages.find((m) => m.role === "user")?.content ?? "") ||
        "New Chat";

    const db = getDb();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO chat_threads
           (id, title, target_provider, target_model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(threadId, derivedTitle, target.provider, target.model, now, now);

      const insertMsg = db.prepare(
        `INSERT INTO chat_messages
           (id, thread_id, role, content, target_provider, target_model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const msg of messages) {
        insertMsg.run(
          crypto.randomUUID(),
          threadId,
          msg.role,
          msg.content,
          target.provider,
          target.model,
          now
        );
      }
    });

    tx();

    log("info", "temporary chat saved", {
      event: "chat_thread.save_temporary",
      id: threadId,
      messageCount: messages.length,
    });

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(threadId) as ThreadRow;

    return Response.json({ thread }, { status: 201 });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/threads/save-temporary",
      method: "POST",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
