import { getDb, contentItems, settings } from "@/db/index";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { log } from "@/lib/logger";
import {
  exportItemsAsJson,
  exportItemsAsMarkdown,
} from "@/lib/markdown-exporter";

const PAGE_SIZE = 500;

function listAllItems() {
  const db = getDb();
  const items = [];
  let offset = 0;

  while (true) {
    const page = contentItems.listWithFilters(db, {
      limit: PAGE_SIZE,
      offset,
      includeHidden: true,
      includePrivate: true,
    });
    items.push(...page.items);
    if (page.items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return items;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");

    if (format !== "markdown" && format !== "json") {
      return errorResponse("VALIDATION_ERROR", "Invalid export format", 400);
    }

    const items = listAllItems();
    const now = new Date();
    const exportedAt = now.toISOString().slice(0, 10);

    // A successful export is the closest thing to a backup the app
    // performs today, so record it as the last backup timestamp. The
    // System info card surfaces this value.
    settings.set(getDb(), "last_backup_at", now.toISOString());

    log("info", "content exported", {
      event: "export.content",
      format,
      count: items.length,
    });

    if (format === "json") {
      return new Response(exportItemsAsJson(items), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="shadowbrain-export-${exportedAt}.json"`,
        },
      });
    }

    return new Response(exportItemsAsMarkdown(items), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="shadowbrain-export-${exportedAt}.md"`,
      },
    });
  } catch (error) {
    logServerError(error, { route: "/api/export", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
