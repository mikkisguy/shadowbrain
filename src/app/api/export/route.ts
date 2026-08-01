import type Database from "better-sqlite3";
import {
  auditLogs,
  contentItems,
  contentLinks,
  contentTags,
  getDb,
  journalPeriods,
  settings,
  tags,
} from "@/db/index";
import { buildExportEnvelope, exportAsJsonString } from "@/lib/data-export";
import { isExportEnvelopeSchemaValid } from "@/lib/data-export/validate-envelope";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ITEM_TAGS,
  IMPORT_MAX_ITEMS,
  IMPORT_MAX_JOURNAL_PERIODS,
  IMPORT_MAX_LINKS,
  IMPORT_MAX_TAGS,
} from "@/lib/data-export/limits";
import { errorResponse, logServerError } from "@/lib/api";
import { requireAuthenticated } from "@/lib/auth/guard";
import { getClientIp } from "@/lib/auth/client-ip";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { exportItemsAsMarkdown } from "@/lib/markdown-exporter";

const PAGE_SIZE = 500;
type Db = Database.Database;

function listAllItems(db: Db) {
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

  // The repository's primary sort is by creation time. Add the id tie-breaker
  // here so pagination and markdown output are deterministic as well.
  items.sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)
  );
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

    const db = getDb();
    const now = new Date();
    const exportedAt = now.toISOString();

    // Keep every export read in one transaction. This gives the payload a
    // single SQLite snapshot even when content changes while it is generated.
    // Serialization is intentionally inside the transaction and before the
    // later write transaction, so a failed serialization cannot mark a backup
    // as successful.
    const snapshot = db.transaction(() => {
      const items = listAllItems(db);
      const tagsRows = tags
        .findAll(db)
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
        );
      const itemTags = contentTags
        .findAll(db)
        .sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) ||
            a.content_id.localeCompare(b.content_id) ||
            a.tag_id.localeCompare(b.tag_id)
        );
      const links = contentLinks
        .findAll(db)
        .sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
        );
      const journalPeriodsRows = journalPeriods
        .findAll(db)
        .sort(
          (a, b) =>
            a.period_start.localeCompare(b.period_start) ||
            a.content_id.localeCompare(b.content_id)
        );
      const envelope = buildExportEnvelope({
        items,
        tags: tagsRows,
        itemTags,
        links,
        journalPeriods: journalPeriodsRows,
        exportedAt,
      });
      const body =
        format === "json"
          ? exportAsJsonString(envelope)
          : exportItemsAsMarkdown(items);

      return {
        body,
        envelope,
        counts: {
          items: envelope.items.length,
          tags: envelope.tags.length,
          item_tags: envelope.item_tags.length,
          links: envelope.links.length,
          journal_periods: envelope.journal_periods.length,
        },
      };
    })();

    const ip = getClientIp(request, {
      header: getEnv().TRUSTED_PROXY_HEADER,
    });

    const bodyBytes = new TextEncoder().encode(snapshot.body).byteLength;
    const schemaOk =
      format !== "json" ? true : isExportEnvelopeSchemaValid(snapshot.envelope);
    const importable =
      format !== "json"
        ? true
        : schemaOk &&
          bodyBytes <= IMPORT_MAX_BYTES &&
          snapshot.counts.items <= IMPORT_MAX_ITEMS &&
          snapshot.counts.tags <= IMPORT_MAX_TAGS &&
          snapshot.counts.item_tags <= IMPORT_MAX_ITEM_TAGS &&
          snapshot.counts.links <= IMPORT_MAX_LINKS &&
          snapshot.counts.journal_periods <= IMPORT_MAX_JOURNAL_PERIODS;

    const auditMetadata = JSON.stringify({
      format,
      counts: snapshot.counts,
      bytes: bodyBytes,
      importable,
    });

    // Only mark last_backup_at when the JSON payload is restorable via a single
    // POST /api/import under the published size/collection ceiling. Oversized
    // dumps are still downloadable for salvage, but are not treated as backups.
    db.transaction(() => {
      if (importable) {
        settings.set(db, "last_backup_at", exportedAt);
      }
      auditLogs.create(db, {
        id: crypto.randomUUID(),
        actor_id: auth.username,
        actor_type: "user",
        action: "content.export",
        entity_type: "export",
        entity_id: format,
        metadata: auditMetadata,
        ip,
        user_agent: request.headers.get("user-agent"),
        created_at: exportedAt,
      });
    })();

    log("info", "content exported", {
      event: "export.content",
      format,
      count: snapshot.counts.items,
      bytes: bodyBytes,
      importable,
    });

    const exportedDate = exportedAt.slice(0, 10);
    if (format === "json") {
      return new Response(snapshot.body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="shadowbrain-export-${exportedDate}.json"`,
          "Cache-Control": "private, no-store",
          "X-ShadowBrain-Importable": importable ? "1" : "0",
        },
      });
    }

    return new Response(snapshot.body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="shadowbrain-export-${exportedDate}.md"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logServerError(error, { route: "/api/export", method: "GET" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
