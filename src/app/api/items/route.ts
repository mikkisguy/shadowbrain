import { z } from "zod";
import { getDb, contentItems, auditLogs } from "@/db/index";
import { parsePagination, errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";

const createSchema = z.object({
  type: z.string(),
  content: z.string().min(1),
  title: z.string().nullable().optional(),
  source: z.string().optional(),
  source_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  is_private: z.number().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseJson(createSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const auditLogId = crypto.randomUUID();
    const db = getDb();
    const metadata = parsed.data.metadata
      ? JSON.stringify(parsed.data.metadata)
      : null;

    const tx = db.transaction(() => {
      contentItems.create(db, {
        id,
        type: parsed.data.type,
        title: parsed.data.title ?? null,
        content: parsed.data.content,
        source: parsed.data.source ?? "manual",
        source_url: parsed.data.source_url ?? null,
        metadata,
        is_private: parsed.data.is_private ?? 0,
        created_at: now,
        updated_at: now,
      });

      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "content_item.create",
        entity_type: "content_item",
        entity_id: id,
        success: 1,
        metadata: null,
        created_at: now,
      });
    });
    tx();

    log("info", "content_item created", { event: "content_item.create", id });
    return Response.json(contentItems.findById(db, id), { status: 201 });
  } catch (error) {
    logServerError(error, { route: "/api/items", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const db = getDb();
    const result = contentItems.listWithFilters(db, {
      type: searchParams.get("type") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      limit,
      offset,
    });

    log("info", "content_items listed", {
      event: "content_item.list",
      count: result.items.length,
    });

    return Response.json({
      items: result.items,
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    logServerError(error, { route: "/api/items", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
