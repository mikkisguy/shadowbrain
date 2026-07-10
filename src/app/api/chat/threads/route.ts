import { z } from "zod";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import type { ThreadRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// GET /api/chat/threads — list threads
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const threads = db
      .prepare(`SELECT * FROM chat_threads ORDER BY updated_at DESC`)
      .all() as ThreadRow[];

    return Response.json({ threads });
  } catch (error) {
    logServerError(error, { route: "/api/chat/threads", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat/threads — create a new (empty) thread
// ---------------------------------------------------------------------------

const createThreadSchema = z.object({
  target: z.object({
    provider: z.enum(["hermes", "opencode-go"]),
    model: z.string().min(1),
  }),
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

    const parsed = parseJson(createThreadSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const { target, title } = parsed.data;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(
      `INSERT INTO chat_threads
         (id, title, target_provider, target_model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, title ?? "New Chat", target.provider, target.model, now, now);

    log("info", "chat thread created", {
      event: "chat_thread.create",
      id,
      provider: target.provider,
    });

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(id) as ThreadRow;

    return Response.json({ thread }, { status: 201 });
  } catch (error) {
    logServerError(error, { route: "/api/chat/threads", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
