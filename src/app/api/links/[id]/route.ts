import { getDb, contentLinks, auditLogs } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";

/**
 * DELETE /api/links/[id]
 *
 * Removes a link between two items. Because the schema stores every
 * link as two rows (forward + reverse), deleting one id requires
 * finding and removing its partner row too. The partner is the row
 * whose `source_id` and `target_id` are swapped and whose `link_type`
 * matches — the two rows share the same `link_type` and `context`,
 * and their ids were generated together in the POST handler.
 *
 * Auth is enforced at the proxy and re-checked here (defense in
 * depth). The response is generic on failure — no internal paths or
 * DB errors leak to the client.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const db = getDb();

    // Look up the link row. We need it to find the reverse row and to
    // record the audit log. If it doesn't exist, return 404.
    const link = db
      .prepare("SELECT * FROM content_links WHERE id = ?")
      .get(id) as
      | {
          id: string;
          source_id: string;
          target_id: string;
          link_type: string;
          context: string | null;
          created_at: string;
        }
      | undefined;

    if (!link) {
      return errorResponse("NOT_FOUND", "Link not found", 404);
    }

    // Find the reverse row (the partner). It has swapped source/target
    // and the same link_type. There should be exactly one, but we use
    // LIMIT 1 defensively.
    const reverse = db
      .prepare(
        `SELECT id FROM content_links
         WHERE source_id = ? AND target_id = ? AND link_type = ?
         LIMIT 1`
      )
      .get(link.target_id, link.source_id, link.link_type) as
      { id: string } | undefined;

    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();

    const tx = db.transaction(() => {
      // Delete both rows. If the reverse is missing (data corruption),
      // we still delete the forward row and log a warning.
      contentLinks.delete(db, link.id);
      if (reverse && reverse.id !== link.id) {
        contentLinks.delete(db, reverse.id);
      }

      auditLogs.create(db, {
        id: auditLogId,
        actor_type: "system",
        action: "content_link.delete",
        entity_type: "content_link",
        entity_id: link.id,
        success: 1,
        metadata: JSON.stringify({
          source_id: link.source_id,
          target_id: link.target_id,
          link_type: link.link_type,
          reverse_id: reverse?.id ?? null,
        }),
        created_at: now,
      });
    });
    tx();

    if (!reverse || reverse.id === link.id) {
      log("warn", "link reverse row missing on delete", {
        event: "content_link.delete.reverse_missing",
        id: link.id,
      });
    }

    log("info", "content_link deleted", {
      event: "content_link.delete",
      id: link.id,
      source_id: link.source_id,
      target_id: link.target_id,
      link_type: link.link_type,
    });

    return Response.json({ id: link.id });
  } catch (error) {
    logServerError(error, { route: "/api/links/[id]", method: "DELETE" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
