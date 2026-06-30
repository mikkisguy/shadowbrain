import { stat } from "fs/promises";
import { getDb, getDbPath, contentItems, settings } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { log } from "@/lib/logger";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const totalItems = contentItems.listWithFilters(db, {
      limit: 1,
      offset: 0,
      includeHidden: true,
      includePrivate: true,
    }).total;

    const dbPath = getDbPath();
    const dbStat = await stat(dbPath);
    const lastBackupAt = settings.get(db, "last_backup_at");

    log("info", "settings system info read", {
      event: "settings.system_info",
      totalItems,
    });

    return Response.json({
      totalItems,
      databaseSizeBytes: dbStat.size,
      databaseSize: formatBytes(dbStat.size),
      lastBackupAt: lastBackupAt ?? null,
    });
  } catch (error) {
    logServerError(error, {
      route: "/api/settings/system-info",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
