import { z } from "zod";
import {
  getDb,
  contentItems,
  contentTags,
  tags as tagsRepo,
  auditLogs,
  deleteEmbedding,
  isVecExtensionLoaded,
} from "@/db/index";
import {
  errorResponse,
  parseJson,
  parseIncludeFlag,
  logServerError,
} from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";

const visibilityFlag = z.coerce.number().int().min(0).max(1).optional();

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

const patchSchema = z
  .object({
    title: z.string().nullable().optional(),
    content: z.string().min(1).optional(),
    type: z.string().optional(),
    source: z.string().optional(),
    source_url: z.string().url().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    is_private: visibilityFlag,
    is_hidden: visibilityFlag,
    tags: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.metadata) return;
    const schema = TYPE_METADATA_SCHEMAS[data.type ?? ""];
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Defense in depth: the proxy already enforces auth.
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    // Visibility opt-in is admin-only; the auth check above cleared
    // the gate, so the parsed flags are trusted.
    const includeHidden = parseIncludeFlag(searchParams.get("include_hidden"));
    const includePrivate = parseIncludeFlag(
      searchParams.get("include_private")
    );

    const db = getDb();
    const result = contentItems.findWithRelations(db, id, {
      includeHidden,
      includePrivate,
    });
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
  // Defense in depth: the proxy already enforces auth.
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

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

    const { searchParams } = new URL(request.url);
    const includeHidden = parseIncludeFlag(searchParams.get("include_hidden"));
    const includePrivate = parseIncludeFlag(
      searchParams.get("include_private")
    );

    const db = getDb();
    // Use the same visibility opt-in as the GET: an item that the
    // caller cannot see cannot be edited either. With auth already
    // passed above, the proxy blocks anonymous access — this check
    // additionally hides the row from an admin who did not opt in.
    const existing = contentItems.findById(db, id, {
      includeHidden,
      includePrivate,
    });
    if (!existing) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();
    const updates: Parameters<typeof contentItems.update>[2] = {
      title:
        parsed.data.title === null ? null : (parsed.data.title ?? undefined),
      content: parsed.data.content ?? undefined,
      type: parsed.data.type ?? undefined,
      source: parsed.data.source ?? undefined,
      source_url:
        parsed.data.source_url === null
          ? null
          : (parsed.data.source_url ?? undefined),
      metadata: parsed.data.metadata
        ? JSON.stringify(parsed.data.metadata)
        : undefined,
      is_private:
        parsed.data.is_private !== undefined
          ? parsed.data.is_private
          : undefined,
      is_hidden:
        parsed.data.is_hidden !== undefined ? parsed.data.is_hidden : undefined,
      updated_at: now,
    };

    const tx = db.transaction(() => {
      contentItems.update(db, id, updates);

      // Sync tags: remove old tags, add new ones, create any that don't exist.
      if (parsed.data.tags !== undefined) {
        // Remove all existing tags for this item.
        const existingTags = contentTags.findByContent(db, id);
        for (const tag of existingTags) {
          contentTags.removeTag(db, id, tag.id);
        }

        // Add new tags, creating them in the tags table if needed.
        for (const tagName of parsed.data.tags) {
          const trimmed = tagName.trim();
          if (!trimmed) continue;
          let tag = tagsRepo.findByName(db, trimmed);
          if (!tag) {
            const tagId = crypto.randomUUID();
            tagsRepo.create(db, {
              id: tagId,
              name: trimmed,
              created_at: now,
            });
            tag = tagsRepo.findById(db, tagId);
          }
          if (tag) {
            contentTags.addTag(db, id, tag.id, now);
          }
        }
      }

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

    const updated = contentItems.findWithRelations(db, id, {
      includeHidden: true,
      includePrivate: true,
    });
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Defense in depth: the proxy already enforces auth.
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const includeHidden = parseIncludeFlag(searchParams.get("include_hidden"));
    const includePrivate = parseIncludeFlag(
      searchParams.get("include_private")
    );

    const db = getDb();
    const existing = contentItems.findById(db, id, {
      includeHidden,
      includePrivate,
    });
    if (!existing) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();
    const tx = db.transaction(() => {
      // content_links and content_tags cascade via ON DELETE FK.
      // content_vectors is a virtual table without FK support — must
      // be cleaned up manually before deleting the parent row.
      // Only attempt if vec0 extension is loaded, otherwise the virtual
      // table won't exist and deleteEmbedding() would throw.
      if (isVecExtensionLoaded(db)) {
        deleteEmbedding(db, id);
      }
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
