import { z } from "zod";
import { getDb, tags, contentTags, auditLogs } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";

const mergeSchema = z.object({
  targetId: z.string().min(1, "Target tag is required"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;
  const { id: sourceId } = await params;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
    }
    const parsed = parseJson(mergeSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const { targetId } = parsed.data;
    if (targetId === sourceId) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Cannot merge a tag into itself",
        400
      );
    }

    const db = getDb();
    const source = tags.findById(db, sourceId);
    if (!source) {
      return errorResponse("NOT_FOUND", "Tag not found", 404);
    }
    const target = tags.findById(db, targetId);
    if (!target) {
      return errorResponse("NOT_FOUND", "Target tag not found", 404);
    }

    const sourceCount =
      (
        db
          .prepare("SELECT COUNT(*) as c FROM content_tags WHERE tag_id = ?")
          .get(sourceId) as { c: number } | undefined
      )?.c ?? 0;
    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();

    const tx = db.transaction(() => {
      contentTags.repointTag(db, sourceId, targetId);
      const result = tags.delete(db, sourceId);
      if (result.changes === 0) {
        throw new TagNotFoundError();
      }
      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "tag.merge",
        entity_type: "tag",
        entity_id: sourceId,
        success: 1,
        metadata: JSON.stringify({
          source: source.name,
          target: target.name,
          affected: sourceCount,
        }),
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

    const targetCount =
      (
        db
          .prepare("SELECT COUNT(*) as c FROM content_tags WHERE tag_id = ?")
          .get(targetId) as { c: number } | undefined
      )?.c ?? 0;
    const merged = { ...target, count: targetCount };

    log("info", "tags merged", {
      event: "tag.merge",
      sourceId,
      targetId,
      affected: sourceCount,
    });
    return Response.json(merged);
  } catch (error) {
    logServerError(error, {
      route: "/api/tags/[id]/merge",
      method: "POST",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

class TagNotFoundError extends Error {
  constructor() {
    super("tag_not_found");
  }
}
