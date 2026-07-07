/**
 * Database operations for the docs sync system.
 *
 * Handles generating stable document IDs, building metadata, processing
 * individual files (upsert + audit log + tags), and pruning orphaned rows.
 *
 * @module
 */
import { createHash, randomUUID } from "crypto";
import { readFile, stat } from "fs/promises";
import type Database from "better-sqlite3";
import { auditLogs, contentItems } from "@/db/index";
import { log } from "@/lib/logger";
import { MAX_FILE_BYTES } from "./discovery";
import { ensureDocTags } from "./tags";
import { DOCS_SYNC_SOURCE } from "./types";

/**
 * Deterministic, UUID-shaped id for a doc file, derived from its path
 * relative to the sync root. Distinct from {@link generateStableId} in
 * the markdown importer (different prefix) so docs and notes with the
 * same relative path cannot collide on the same `content_items` row.
 *
 * Format: `docs-sync-<32 hex chars>`.
 *
 * **Caveat:** the id is derived from the *relative* path only. Syncing
 * `--dir docs/a` (relPaths like `x.md`) and then `--dir docs/b` (relPaths
 * like `y.md`) makes the second run's prune delete every row the first
 * run created, because neither sees the other's files on disk. Use a
 * single sync root per ShadowBrain install unless you want rows from
 * different roots to clobber each other.
 */
export function generateDocsId(relPath: string): string {
  const hash = createHash("sha256").update(relPath).digest("hex");
  return `docs-sync-${hash.slice(0, 32)}`;
}

/**
 * Derive the doc title from its relative path: the final path segment
 * with the extension stripped (e.g. `api/getting-started.md` →
 * `getting-started`). Computed inline rather than via `parseMarkdownFile`
 * because docs-sync stores the raw body verbatim and never reads the
 * parsed body / frontmatter, so running the full gray-matter parser
 * would be wasted work and could emit misleading frontmatter warnings.
 */
function filenameTitleFromRelPath(relPath: string): string {
  return relPath.replace(/\.md$/i, "").split("/").pop()!;
}

/**
 * Build the `metadata` JSON for a doc. Currently just the file path
 * relative to the project root (e.g. `docs/getting-started.md`), which
 * lets the UI / chat cite the source file.
 */
function buildMetadata(docsRootName: string, relPath: string): string {
  return JSON.stringify({ file_path: `${docsRootName}/${relPath}` });
}

/**
 * Per-file outcome type. On success, returns the operation type.
 * On failure, returns an error message string.
 */
export type FileOutcome = "created" | "updated" | "skipped" | string;

/**
 * Process a single markdown file: validate size, read content, classify
 * the change (create / update / skip), and either simulate (dry-run) or
 * actually run the upsert transaction.
 *
 * Returns `"created"`, `"updated"`, or `"skipped"` on success, or an
 * error message string on failure.
 */
export async function processFile(
  db: Database.Database,
  absPath: string,
  relPath: string,
  id: string,
  docsRootName: string,
  opts: { skipUnchanged: boolean; dryRun: boolean }
): Promise<FileOutcome> {
  const { skipUnchanged, dryRun } = opts;

  const fileStats = await stat(absPath);
  if (fileStats.size > MAX_FILE_BYTES) {
    const reason = `File too large (${fileStats.size} bytes > ${MAX_FILE_BYTES})`;
    log("warn", "docs sync skipped", { relPath, reason });
    return reason;
  }

  const raw = await readFile(absPath, "utf-8");
  const filenameTitle = filenameTitleFromRelPath(relPath);
  const metadata = buildMetadata(docsRootName, relPath);
  const now = new Date().toISOString();

  /* ── dry-run: classify without writing ── */
  if (dryRun) {
    const existing = contentItems.findById(db, id, {
      includeHidden: true,
      includePrivate: true,
    });
    if (!existing) return "created";
    if (
      skipUnchanged &&
      existing.content === raw &&
      existing.metadata === metadata
    ) {
      return "skipped";
    }
    return "updated";
  }

  /* ── live: per-file transaction ── */
  const outcome = db.transaction((): FileOutcome => {
    const existing = contentItems.findById(db, id, {
      includeHidden: true,
      includePrivate: true,
    });

    if (existing) {
      const contentUnchanged = existing.content === raw;
      const metaUnchanged = existing.metadata === metadata;
      if (skipUnchanged && contentUnchanged && metaUnchanged) {
        // Self-heal tag associations even when the body is unchanged.
        ensureDocTags(db, id, relPath, now);
        return "skipped";
      }

      contentItems.update(db, id, {
        title: filenameTitle,
        content: raw,
        metadata,
        updated_at: now,
      });
      auditLogs.create(db, {
        id: randomUUID(),
        actor_type: "system",
        action: "content_item.import",
        entity_type: "content_item",
        entity_id: id,
        success: 1,
        metadata: JSON.stringify({
          source: DOCS_SYNC_SOURCE,
          relPath,
          op: "update",
        }),
        created_at: now,
      });
      ensureDocTags(db, id, relPath, now);
      return "updated";
    }

    // New row.
    contentItems.create(db, {
      id,
      type: "note",
      title: filenameTitle,
      content: raw,
      source: DOCS_SYNC_SOURCE,
      metadata,
      created_at: now,
      updated_at: now,
    });
    auditLogs.create(db, {
      id: randomUUID(),
      actor_type: "system",
      action: "content_item.import",
      entity_type: "content_item",
      entity_id: id,
      success: 1,
      metadata: JSON.stringify({
        source: DOCS_SYNC_SOURCE,
        relPath,
        op: "create",
      }),
      created_at: now,
    });
    ensureDocTags(db, id, relPath, now);
    return "created";
  })();

  return outcome;
}

/**
 * Delete `content_items` whose `source` is `docs-sync` but whose id is
 * no longer in `currentIds` (files removed from disk since last sync).
 * Cascading FKs remove their `content_tags` rows automatically.
 * Returns the count of deleted (or would-delete in dry-run) rows.
 *
 * @param db          Open better-sqlite3 connection.
 * @param currentIds  Set of document ids that still exist on disk.
 * @param opts.dryRun If `true`, count without actually deleting.
 */
export function pruneMissing(
  db: Database.Database,
  currentIds: Set<string>,
  opts: { dryRun: boolean }
): number {
  const { dryRun } = opts;
  let deleted = 0;

  const docsRows = db
    .prepare("SELECT id, metadata FROM content_items WHERE source = ?")
    .all(DOCS_SYNC_SOURCE) as Array<{ id: string; metadata: string | null }>;

  if (dryRun) {
    for (const row of docsRows) {
      if (!currentIds.has(row.id)) deleted += 1;
    }
    return deleted;
  }

  const now = new Date().toISOString();
  const pruneTx = db.transaction(() => {
    for (const row of docsRows) {
      if (!currentIds.has(row.id)) {
        let filePath: string | undefined;
        try {
          filePath = row.metadata
            ? (JSON.parse(row.metadata).file_path as string | undefined)
            : undefined;
        } catch {
          // Malformed metadata — leave file_path out of the audit entry.
        }
        contentItems.delete(db, row.id);
        auditLogs.create(db, {
          id: randomUUID(),
          actor_type: "system",
          action: "content_item.delete",
          entity_type: "content_item",
          entity_id: row.id,
          success: 1,
          metadata: JSON.stringify({
            source: DOCS_SYNC_SOURCE,
            op: "prune",
            ...(filePath ? { file_path: filePath } : {}),
          }),
          created_at: now,
        });
        deleted += 1;
      }
    }
  });
  pruneTx();

  return deleted;
}
