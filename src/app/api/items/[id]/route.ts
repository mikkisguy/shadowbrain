import { z } from "zod";
import { getDb, contentItems, auditLogs, deleteEmbedding } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";

const patchSchema = z.object({
  title: z.string().nullable().optional(),
  content: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = getDb();
    const result = contentItems.findWithRelations(db, id);
    if (!result) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }
    return Response.json(result);
  } catch (error) {
    logServerError(error, { route: "/api/items/[id]", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const existing = contentItems.findById(db, id);
    if (!existing) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();
    const updates = {
      title:
        parsed.data.title === null ? null : (parsed.data.title ?? undefined),
      content: parsed.data.content ?? undefined,
      metadata: parsed.data.metadata
        ? JSON.stringify(parsed.data.metadata)
        : undefined,
      updated_at: now,
    };

    const tx = db.transaction(() => {
      contentItems.update(db, id, updates);

      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "content_item.update",
        entity_type: "content_item",
        entity_id: id,
        success: 1,
        metadata: null,
        created_at: now,
      });
    });
    tx();

    const updated = contentItems.findWithRelations(db, id);
    log("info", "content_item updated", {
      event: "content_item.update",
      id,
    });
    return Response.json(updated);
  } catch (error) {
    logServerError(error, { route: "/api/items/[id]", method: "PATCH" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = getDb();
    const existing = contentItems.findById(db, id);
    if (!existing) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();
    const tx = db.transaction(() => {
      // content_links and content_tags cascade via ON DELETE FK.
      // content_vectors is a virtual table without FK support — must
      // be cleaned up manually before deleting the parent row.
      deleteEmbedding(db, id);
      contentItems.delete(db, id);

      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "content_item.delete",
        entity_type: "content_item",
        entity_id: id,
        success: 1,
        metadata: null,
        created_at: now,
      });
    });
    tx();

    log("info", "content_item deleted", {
      event: "content_item.delete",
      id,
    });
    return Response.json({ id });
  } catch (error) {
    logServerError(error, { route: "/api/items/[id]", method: "DELETE" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
