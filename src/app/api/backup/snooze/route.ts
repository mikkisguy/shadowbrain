import { getDb, settings } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { readBackupStatus } from "@/lib/backup/reminder";
import { log } from "@/lib/logger";

/**
 * Increment the consecutive-snooze counter (used only at the 14+ severity).
 *
 * `POST /api/backup/snooze` → bumps `backup_snooze_count` by 1 and returns
 * the new {@link BackupStatus}. The caller (the reminder banner) only invokes
 * this when the current severity is `enforce`; the endpoint itself just
 * increments.
 *
 * Auth-gated and rate-limited by the proxy's API bucket.
 */

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const currentRaw = settings.get(db, "backup_snooze_count");
    const current = currentRaw ? parseInt(currentRaw, 10) : 0;
    const next = (Number.isFinite(current) && current >= 0 ? current : 0) + 1;
    settings.set(db, "backup_snooze_count", String(next));

    log("info", "backup reminder snoozed", {
      event: "backup.snoozed",
      snoozeCount: next,
    });

    return Response.json(readBackupStatus(db));
  } catch (error) {
    logServerError(error, { route: "/api/backup/snooze", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
