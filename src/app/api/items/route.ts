import { z } from "zod";
import {
  getDb,
  contentItems,
  contentTags,
  contentLinks,
  auditLogs,
} from "@/db/index";
import {
  parsePagination,
  errorResponse,
  parseJson,
  parseIncludeFlag,
  logServerError,
} from "@/lib/api";
import { log } from "@/lib/logger";
import { fetchBookmarkMetadata } from "@/lib/metadata-fetcher";
import { requireAuthenticated } from "@/lib/auth/guard";

const visibilityFlag = z.coerce.number().int().min(0).max(1).optional();

/**
 * Per-type `metadata` shape validation (issue #103). The documented
 * fields are optional — metadata as a whole is optional — but when a
 * field is present it must have the correct type, otherwise the
 * request fails with `VALIDATION_ERROR` / 400. `.passthrough()` keeps
 * unknown keys so future fields don't break older validators.
 *
 * Types without an entry here (note, journal, bookmark, question,
 * raw_text, image) keep the free-form record validation from the base
 * schema.
 */
const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid datetime",
  });

const PERSON_METADATA = z
  .object({
    email: z.string().optional(),
    social_links: z.array(z.string().url()).optional(),
    phone_number: z.string().optional(),
    role: z.string().optional(),
  })
  .passthrough();

const PROJECT_METADATA = z
  .object({
    status: z.string().optional(),
    repo: z.string().optional(),
    started: isoDateTime.optional(),
    goal_end_date: isoDateTime.optional(),
  })
  .passthrough();

const EVENT_METADATA = z
  .object({
    start_date: isoDateTime.optional(),
    end_date: isoDateTime.optional(),
    duration: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .passthrough();

const DREAM_METADATA = z
  .object({
    mood: z.string().optional(),
  })
  .passthrough();

const TYPE_METADATA_SCHEMAS: Record<string, z.ZodTypeAny> = {
  person: PERSON_METADATA,
  project: PROJECT_METADATA,
  event: EVENT_METADATA,
  dream: DREAM_METADATA,
};

const createSchema = z
  .object({
    type: z.string(),
    content: z.string().min(1),
    title: z.string().nullable().optional(),
    source: z.string().optional(),
    source_url: z.string().url().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    is_private: visibilityFlag,
    is_hidden: visibilityFlag,
  })
  .superRefine((data, ctx) => {
    if (!data.metadata) return;
    const schema = TYPE_METADATA_SCHEMAS[data.type];
    if (!schema) return;
    const result = schema.safeParse(data.metadata);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["metadata", ...issue.path],
        });
      }
    }
  });

export async function POST(request: Request) {
  // Defense in depth: the proxy already enforces auth, but the route
  // re-checks so a test that calls this function directly (without
  // going through the proxy) still fails closed.
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

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

    // For bookmarks, if the user didn't provide a title, use the fetched
    // og:title. This ensures the item has a meaningful title instead of
    // just the URL. The user can still override by passing a title.
    const title =
      parsed.data.title ??
      (isBookmark && fetchOutcome?.ok ? fetchOutcome.metadata.title : null) ??
      null;

    // Visibility flags are admin-only. The proxy already gates every
    // request reaching this route, so the `auth.ok` branch above is
    // the "authenticated" path; the body fields are trusted.
    const isPrivate = parsed.data.is_private ?? 0;
    const isHidden = parsed.data.is_hidden ?? 0;

    const tx = db.transaction(() => {
      contentItems.create(db, {
        id,
        type: parsed.data.type,
        title,
        content: parsed.data.content,
        source: parsed.data.source ?? "manual",
        source_url: sourceUrl,
        metadata,
        is_private: isPrivate,
        is_hidden: isHidden,
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
    // The admin just created the row — return it with the visibility
    // opt-in forced on so a hidden / private item is still visible
    // in the response body. Without this, the response would be `null`
    // for any creation with `is_hidden: 1` or `is_private: 1`.
    return Response.json(
      contentItems.findById(db, id, {
        includeHidden: true,
        includePrivate: true,
      }),
      { status: 201 }
    );
  } catch (error) {
    logServerError(error, { route: "/api/items", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function GET(request: Request) {
  // Defense in depth: the proxy already enforces auth.
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    // Visibility opt-in is admin-only. The authenticated request above
    // already cleared the auth gate, so the parsed flags are trusted
    // and we just forward them to the read helper.
    const includeHidden = parseIncludeFlag(searchParams.get("include_hidden"));
    const includePrivate = parseIncludeFlag(
      searchParams.get("include_private")
    );

    const db = getDb();
    const result = contentItems.listWithFilters(db, {
      type: searchParams.get("type") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      limit,
      offset,
      includeHidden,
      includePrivate,
    });

    // Attach each item's tag names via a single batched query so the
    // Browse card can render (and click) tags without an N+1. The
    // card only needs names; full tag rows live on `/api/items/[id]`.
    const ids = result.items.map((i) => i.id);
    const tagMap = contentTags.findNamesByContentIds(db, ids);
    // Resolve each item's cover image from its first linked image-type
    // item (visibility-aware). Falls back to the row's own image_path,
    // which is what powers image-type cards; non-image types get their
    // cover from links. /api/search agrees on this so the browse card
    // never branches on the data source.
    const coverMap = contentLinks.findCoverImagesBySourceIds(db, ids, {
      includeHidden,
      includePrivate,
    });
    const itemsWithTags = result.items.map((i) => ({
      ...i,
      image_path: coverMap[i.id] ?? i.image_path,
      tags: tagMap[i.id] ?? [],
    }));

    log("info", "content_items listed", {
      event: "content_item.list",
      count: result.items.length,
      includeHidden,
      includePrivate,
    });

    return Response.json({
      items: itemsWithTags,
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    logServerError(error, { route: "/api/items", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
