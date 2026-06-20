import { z } from "zod";
import { getDb, contentItems, auditLogs } from "@/db/index";
import {
  parsePagination,
  errorResponse,
  parseJson,
  logServerError,
} from "@/lib/api";
import { log } from "@/lib/logger";
import { fetchBookmarkMetadata } from "@/lib/metadata-fetcher";

const createSchema = z.object({
  type: z.string(),
  content: z.string().min(1),
  title: z.string().nullable().optional(),
  source: z.string().optional(),
  source_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  is_private: z.coerce.number().int().min(0).max(1).optional(),
});

export async function POST(request: Request) {
  // TODO: add auth check for item creation.
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

    // For bookmarks, auto-fetch og:title / description / favicon from
    // the URL detected in `content`. Failure is graceful: the bookmark
    // is still saved with whatever metadata the caller provided. The
    // SSRF guard inside `fetchBookmarkMetadata` prevents the fetcher
    // from reaching private / loopback / link-local addresses — the
    // user cannot use this endpoint to probe internal services.
    const isBookmark = parsed.data.type === "bookmark";
    const fetchOutcome = isBookmark
      ? await fetchBookmarkMetadata(parsed.data.content)
      : null;

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const auditLogId = crypto.randomUUID();
    const db = getDb();

    // Merge auto-fetched bookmark metadata with any user-supplied
    // metadata. User-supplied keys win on conflict — a caller passing
    // `{ title: "My Note" }` is treated as an explicit override.
    const mergedMetadata: Record<string, unknown> = {};
    if (fetchOutcome?.ok) {
      Object.assign(mergedMetadata, fetchOutcome.metadata);
    } else if (fetchOutcome && !fetchOutcome.ok && fetchOutcome.metadata.url) {
      // Fetch failed but a URL was found — record the attempt so the
      // user can tell "we never looked" from "we looked and got nothing".
      mergedMetadata.auto_fetch = {
        status: "error",
        reason: fetchOutcome.reason,
        url: fetchOutcome.metadata.url,
        fetched_at: fetchOutcome.metadata.fetched_at,
      };
    }
    if (parsed.data.metadata) {
      Object.assign(mergedMetadata, parsed.data.metadata);
    }
    const metadata =
      Object.keys(mergedMetadata).length > 0
        ? JSON.stringify(mergedMetadata)
        : null;

    // If the caller didn't pass a `source_url` explicitly, use the URL
    // we found in content (even when the fetch failed — it still tells
    // us what the user meant to link).
    const sourceUrl =
      parsed.data.source_url ?? (fetchOutcome?.metadata.url || null) ?? null;

    const tx = db.transaction(() => {
      contentItems.create(db, {
        id,
        type: parsed.data.type,
        title: parsed.data.title ?? null,
        content: parsed.data.content,
        source: parsed.data.source ?? "manual",
        source_url: sourceUrl,
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

    log("info", "content_item created", {
      event: "content_item.create",
      id,
      type: parsed.data.type,
      bookmarkFetchOk: fetchOutcome?.ok ?? null,
    });
    return Response.json(contentItems.findById(db, id), { status: 201 });
  } catch (error) {
    logServerError(error, { route: "/api/items", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function GET(request: Request) {
  // TODO: add auth check for item listing.
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
