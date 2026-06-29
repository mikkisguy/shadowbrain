import { getDb, tags, auditLogs } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;
  try {
    const db = getDb();
    const now = new Date().toISOString();
    let deleted = 0;

    const tx = db.transaction(() => {
      const unused = tags.listWithCounts(db).filter((row) => row.count === 0);
      for (const tag of unused) {
        const result = tags.delete(db, tag.id);
        if (result.changes === 0) continue;
        deleted += 1;
        auditLogs.create(db, {
          id: crypto.randomUUID(),
          actor_type: "system",
          action: "tag.delete",
          entity_type: "tag",
          entity_id: tag.id,
          success: 1,
          metadata: JSON.stringify({ name: tag.name, bulk: true }),
          created_at: now,
        });
      }
    });
    tx();

    log("info", "unused tags deleted", {
      event: "tag.delete_unused",
      deleted,
    });
    return Response.json({ deleted });
  } catch (error) {
    logServerError(error, {
      route: "/api/tags/delete-unused",
      method: "POST",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
