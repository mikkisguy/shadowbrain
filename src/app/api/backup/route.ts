import { getDb, settings, auditLogs } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { getClientIp } from "@/lib/auth/client-ip";
import { readBackupStatus } from "@/lib/backup/reminder";
import { log } from "@/lib/logger";

/**
 * Backup-reminder status and the "Mark as backed up" action.
 *
 * - `GET /api/backup`  → current {@link BackupStatus}.
 * - `POST /api/backup` → record a completed backup: stamp `last_backup_at`,
 *   reset `backup_snooze_count` to 0, write the `backup.marked` audit event
 *   attributed to the session user, and return the new status.
 *
 * Both are auth-gated by `requireAuthenticated` (defense-in-depth behind the
 * proxy) and rate-limited by the proxy's API bucket. The mark action writes
 * the audit row in the same transaction as the settings update so the record
 * and the state can never drift apart.
 */

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    return Response.json(readBackupStatus(getDb()));
  } catch (error) {
    logServerError(error, { route: "/api/backup", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const now = new Date().toISOString();
    const auditLogId = crypto.randomUUID();

    const tx = db.transaction(() => {
      settings.set(db, "last_backup_at", now);
      settings.set(db, "backup_snooze_count", "0");
      auditLogs.create(db, {
        id: auditLogId,
        actor_id: auth.username,
        actor_type: "user",
        action: "backup.marked",
        entity_type: "settings",
        entity_id: "last_backup_at",
        success: 1,
        metadata: JSON.stringify({ last_backup_at: now }),
        ip: getClientIp(request),
        user_agent: request.headers.get("user-agent"),
        created_at: now,
      });
    });
    tx();

    log("info", "backup marked as complete", { event: "backup.marked" });

    return Response.json(readBackupStatus(db));
  } catch (error) {
    logServerError(error, { route: "/api/backup", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
