import { z } from "zod";
import { getDb, tags, auditLogs } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";

// Mirrors the constraints in /api/tags POST so a rename can't bypass
// the same-character / length limits the create path enforces.
const TAG_NAME_REGEX = /^[a-zA-Z0-9 _-]+$/;

const patchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(64, "Name is too long")
    .regex(TAG_NAME_REGEX, "Name contains invalid characters"),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;
  // TODO: apply per-IP rate limit once src/lib/rate-limit.ts lands (#56).
  const { id } = await params;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }
    const parsed = parseJson(patchSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const db = getDb();
    const existing = tags.findById(db, id);
    if (!existing) {
      return errorResponse("NOT_FOUND", "Tag not found", 404);
    }

    // No-op: renaming to the exact same name (same case) writes nothing
    // — skip the UPDATE and the audit log row that would only record
    // "before == after".
    if (existing.name === parsed.data.name) {
      return Response.json(existing);
    }

    // A case-only change (e.g. "alpha" -> "ALPHA") is a meaningful
    // rename (display case changes), so allow it without a 409 — the
    // DB unique constraint is COLLATE NOCASE, but the stored value
    // preserves the user's input.
    if (existing.name.toLowerCase() !== parsed.data.name.toLowerCase()) {
      const colliding = tags.findByName(db, parsed.data.name);
      if (colliding && colliding.id !== id) {
        return errorResponse(
          "CONFLICT",
          "Tag with this name already exists",
          409
        );
      }
    }

    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();
    const previousName = existing.name;
    const newName = parsed.data.name;

    try {
      const tx = db.transaction(() => {
        tags.update(db, id, { name: newName });
        auditLogs.create(db, {
          id: auditLogId,
          actor_type: "system",
          action: "tag.update",
          entity_type: "tag",
          entity_id: id,
          success: 1,
          metadata: JSON.stringify({ previous: previousName, next: newName }),
          created_at: now,
        });
      });
      tx();
    } catch (error) {
      // The pre-check above catches the common case, but a concurrent
      // create/rename can still land here. Map to a clean 409.
      if (isUniqueConstraintError(error)) {
        return errorResponse(
          "CONFLICT",
          "Tag with this name already exists",
          409
        );
      }
      throw error;
    }

    log("info", "tag updated", { event: "tag.update", id });
    return Response.json(tags.findById(db, id));
  } catch (error) {
    logServerError(error, { route: "/api/tags/[id]", method: "PATCH" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;
  // TODO: apply per-IP rate limit once src/lib/rate-limit.ts lands (#56).
  const { id } = await params;
  try {
    const db = getDb();
    const existing = tags.findById(db, id);
    if (!existing) {
      return errorResponse("NOT_FOUND", "Tag not found", 404);
    }

    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();

    const tx = db.transaction(() => {
      // content_tags rows for this tag are removed automatically by the
      // ON DELETE CASCADE foreign key declared in 0001_initial_schema.
      const result = tags.delete(db, id);
      if (result.changes === 0) {
        // Lost a race with another delete — surface 404 to keep the
        // contract "idempotent but informative" instead of pretending
        // we deleted something we didn't.
        throw new TagNotFoundError();
      }
      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "tag.delete",
        entity_type: "tag",
        entity_id: id,
        success: 1,
        metadata: JSON.stringify({ name: existing.name }),
        created_at: now,
      });
    });

    try {
      tx();
    } catch (error) {
      if (error instanceof TagNotFoundError) {
        return errorResponse("NOT_FOUND", "Tag not found", 404);
      }
      throw error;
    }

    log("info", "tag deleted", { event: "tag.delete", id });
    return Response.json({ id });
  } catch (error) {
    logServerError(error, { route: "/api/tags/[id]", method: "DELETE" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

class TagNotFoundError extends Error {
  constructor() {
    super("tag_not_found");
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
