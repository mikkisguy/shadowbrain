import { z } from "zod";
import { getDb, tags, auditLogs } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";

// Tag names allow ASCII letters, digits, spaces, hyphens, and underscores.
// We deliberately reject punctuation so tags stay safe to embed in URLs
// and don't surprise the search query parser. Length is capped at 64
// chars to match the `type` field on content_items.
const TAG_NAME_REGEX = /^[a-zA-Z0-9 _-]+$/;

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(64, "Name is too long")
    .regex(TAG_NAME_REGEX, "Name contains invalid characters"),
});

export async function GET() {
  // TODO: add auth check for tag listing.
  // TODO: apply per-IP rate limit once src/lib/rate-limit.ts lands (#56).
  try {
    const db = getDb();
    const rows = tags.listWithCounts(db);

    log("info", "tags listed", {
      event: "tag.list",
      count: rows.length,
    });
    return Response.json({ tags: rows, total: rows.length });
  } catch (error) {
    logServerError(error, { route: "/api/tags", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function POST(request: Request) {
  // TODO: add auth check for tag creation.
  // TODO: apply per-IP rate limit once src/lib/rate-limit.ts lands (#56).
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }
    const parsed = parseJson(createSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const db = getDb();
    // The unique constraint on `tags.name` is COLLATE NOCASE, so we must
    // check with the same collation to avoid a race where two clients
    // each pass the pre-check and one then hits a unique-constraint
    // error at INSERT time. The unique constraint is the real source of
    // truth; this pre-check just turns the common case into a clean 409.
    if (tags.findByName(db, parsed.data.name)) {
      return errorResponse(
        "CONFLICT",
        "Tag with this name already exists",
        409
      );
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const auditLogId = crypto.randomUUID();

    try {
      const tx = db.transaction(() => {
        tags.create(db, { id, name: parsed.data.name, created_at: now });
        auditLogs.create(db, {
          id: auditLogId,
          actor_type: "system",
          action: "tag.create",
          entity_type: "tag",
          entity_id: id,
          success: 1,
          metadata: JSON.stringify({ name: parsed.data.name }),
          created_at: now,
        });
      });
      tx();
    } catch (error) {
      // Map a UNIQUE-constraint race (SqliteError, code SQLITE_CONSTRAINT)
      // to a clean 409 instead of leaking the DB error to the client.
      if (isUniqueConstraintError(error)) {
        return errorResponse(
          "CONFLICT",
          "Tag with this name already exists",
          409
        );
      }
      throw error;
    }

    log("info", "tag created", { event: "tag.create", id });
    return Response.json(tags.findById(db, id), { status: 201 });
  } catch (error) {
    logServerError(error, { route: "/api/tags", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
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
