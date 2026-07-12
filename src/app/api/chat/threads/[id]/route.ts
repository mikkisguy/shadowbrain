import { z } from "zod";
import { getDb } from "@/db/index";
import { requireAuthenticated } from "@/lib/auth/guard";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import type { ThreadRow, MessageRow } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// PATCH /api/chat/threads/[id] — rename thread
// ---------------------------------------------------------------------------

const renameSchema = z.object({
  title: z.string().min(1).optional(),
  allow_model_save: z.union([z.literal(0), z.literal(1)]).optional(),
  grounded: z.union([z.literal(0), z.literal(1)]).optional(),
  include_private_in_ai: z.union([z.literal(0), z.literal(1)]).optional(),
});

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

    const parsed = parseJson(renameSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    if (Object.keys(parsed.data).length === 0) {
      return errorResponse(
        "VALIDATION_ERROR",
        "At least one field must be provided",
        400
      );
    }

    const db = getDb();
    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(id) as ThreadRow | undefined;

    if (!thread) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }

    const setClauses: string[] = [];
    const updateParams: (string | number)[] = [];

    if (parsed.data.title !== undefined) {
      setClauses.push("title = ?");
      updateParams.push(parsed.data.title);
    }
    if (parsed.data.allow_model_save !== undefined) {
      setClauses.push("allow_model_save = ?");
      updateParams.push(parsed.data.allow_model_save);
    }
    if (parsed.data.grounded !== undefined) {
      setClauses.push("grounded = ?");
      updateParams.push(parsed.data.grounded);
    }
    if (parsed.data.include_private_in_ai !== undefined) {
      setClauses.push("include_private_in_ai = ?");
      updateParams.push(parsed.data.include_private_in_ai);
    }

    const now = new Date().toISOString();
    setClauses.push("updated_at = ?");
    updateParams.push(now);
    updateParams.push(id);

    db.prepare(
      `UPDATE chat_threads SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...updateParams);

    const eventLabel =
      parsed.data.title !== undefined
        ? "chat_thread.rename"
        : "chat_thread.update_settings";
    log(
      "info",
      eventLabel === "chat_thread.rename"
        ? "chat thread renamed"
        : "chat thread settings updated",
      {
        event: eventLabel,
        id,
      }
    );

    const updated = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(id) as ThreadRow;

    return Response.json({ thread: updated });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/threads/[id]",
      method: "PATCH",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/chat/threads/[id] — delete thread (cascade deletes messages)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const db = getDb();

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(id) as ThreadRow | undefined;

    if (!thread) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }

    db.prepare("DELETE FROM chat_threads WHERE id = ?").run(id);

    log("info", "chat thread deleted", {
      event: "chat_thread.delete",
      id,
    });

    return Response.json({ ok: true });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/threads/[id]",
      method: "DELETE",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/chat/threads/[id] — get single thread
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const db = getDb();

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(id) as ThreadRow | undefined;

    if (!thread) {
      return errorResponse("NOT_FOUND", "Thread not found", 404);
    }

    // Include messages ordered by creation time
    const messages = db
      .prepare(
        `SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC`
      )
      .all(id) as MessageRow[];

    return Response.json({ thread, messages });
  } catch (error) {
    logServerError(error, {
      route: "/api/chat/threads/[id]",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
