import { z } from "zod";
import { getDb, contentItems, contentLinks, auditLogs } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";

// Link types are part of the issue's public contract for /api/links
// (see #16). The set is closed: a typo in `link_type` is almost always
// a client bug, so we reject unknown values with 400 rather than
// silently storing them. `references` is the default — it matches the
// 6 verb forms called out in the acceptance criteria.
// Additional content-pairing link types (issue #103): `involves`,
// `bookmarked_for`, and `happened_during` link specific content types.
const LINK_TYPES = [
  "references",
  "contradicts",
  "questions",
  "answers",
  "depends-on",
  "related-to",
  "involves",
  "bookmarked_for",
  "happened_during",
] as const;

const createSchema = z.object({
  source_id: z.string().min(1, "source_id is required"),
  target_id: z.string().min(1, "target_id is required"),
  link_type: z.enum(LINK_TYPES).default("references"),
  context: z.string().max(2000).nullable().optional(),
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
    const parsed = parseJson(createSchema, body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
        issues: parsed.details,
      });
    }

    // A self-link is a client bug — surface a clean 400 instead of
    // letting it through and then having the duplicate check fire.
    if (parsed.data.source_id === parsed.data.target_id) {
      return errorResponse(
        "VALIDATION_ERROR",
        "source_id and target_id must be different",
        400
      );
    }

    const db = getDb();
    // The acceptance criteria for #16 call for 400 when either item
    // is missing, not 404 — this is a validation failure (the request
    // references a row that doesn't exist), not a route-not-found.
    // We check both items together; the same response is used for
    // either miss so we don't leak which side is wrong.
    //
    // Linking is an admin operation (this route is already gated by
    // `requireAuthenticated` above) and the response exposes no item
    // content — only the link row's id, type, context, and timestamp.
    // So we always look up the source / target with the visibility
    // opt-in forced on; the admin must be able to link hidden and
    // private items.
    const source = contentItems.findById(db, parsed.data.source_id, {
      includeHidden: true,
      includePrivate: true,
    });
    const target = contentItems.findById(db, parsed.data.target_id, {
      includeHidden: true,
      includePrivate: true,
    });
    if (!source || !target) {
      return errorResponse(
        "VALIDATION_ERROR",
        "source_id and target_id must reference existing items",
        400
      );
    }

    const now = new Date().toISOString();
    const forwardId = crypto.randomUUID();
    const reverseId = crypto.randomUUID();
    const auditLogId = crypto.randomUUID();

    // The duplicate check, the forward + reverse inserts, and the
    // audit log all run inside one transaction. A `content_links`
    // table has no UNIQUE constraint, so the application-level
    // check is the only duplicate guard — moving it inside the
    // transaction (rather than checking, then opening a tx) means
    // the read and the write share a single atomic window. If the
    // check were outside, any future `await` between check and
    // commit would open a TOCTOU window where two concurrent
    // requests for the same link could both win.
    let conflict = false;
    const tx = db.transaction(() => {
      // The check covers both directions — the schema stores
      // bidirectional links as two rows, so a "unique on (source,
      // target, link_type)" constraint would not detect a re-request
      // that swaps source and target. We treat (a, b, type) and
      // (b, a, type) as the same link.
      if (
        contentLinks.existsBetween(
          db,
          parsed.data.source_id,
          parsed.data.target_id,
          parsed.data.link_type
        )
      ) {
        conflict = true;
        return;
      }
      contentLinks.create(db, {
        id: forwardId,
        source_id: parsed.data.source_id,
        target_id: parsed.data.target_id,
        link_type: parsed.data.link_type,
        context: parsed.data.context ?? null,
        created_at: now,
      });
      contentLinks.create(db, {
        id: reverseId,
        source_id: parsed.data.target_id,
        target_id: parsed.data.source_id,
        link_type: parsed.data.link_type,
        context: parsed.data.context ?? null,
        created_at: now,
      });
      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "content_link.create",
        entity_type: "content_link",
        entity_id: forwardId,
        success: 1,
        metadata: JSON.stringify({
          source_id: parsed.data.source_id,
          target_id: parsed.data.target_id,
          link_type: parsed.data.link_type,
        }),
        created_at: now,
      });
    });
    tx();

    if (conflict) {
      return errorResponse(
        "CONFLICT",
        "A link of this type already exists between these items",
        409
      );
    }

    // Build the response from the values we already know — the
    // forward row's id, source_id, target_id, link_type, context,
    // and created_at are all in scope. This avoids a redundant
    // read and removes any chance of returning `undefined` if the
    // follow-up SELECT ever sees an empty result set.
    const created = {
      id: forwardId,
      source_id: parsed.data.source_id,
      target_id: parsed.data.target_id,
      link_type: parsed.data.link_type,
      context: parsed.data.context ?? null,
      created_at: now,
    };

    log("info", "content_link created", {
      event: "content_link.create",
      id: forwardId,
      source_id: parsed.data.source_id,
      target_id: parsed.data.target_id,
      link_type: parsed.data.link_type,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    logServerError(error, { route: "/api/links", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
