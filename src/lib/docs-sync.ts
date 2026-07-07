/**
 * Docs sync system — keeps `docs/` in sync with the ShadowBrain database.
 *
 * Mirrors the markdown note importer (`@/lib/markdown-importer`) but is
 * specialised for project documentation:
 *
 * - Items are stored with `source='docs-sync'` so they can be told apart
 *   from manually imported notes (`source='markdown-import'`).
 * - Stable ids use a `docs-sync-` prefix so a doc and a note that happen
 *   to share a relative path never collide on the same row.
 * - The full file content (frontmatter included) is stored as the body so
 *   docs are browsable verbatim from the web UI / chat.
 * - `metadata` carries `{ "file_path": "docs/<rel>" }` for reference.
 * - Every doc is tagged `project:shadowbrain`, `docs`, and a
 *   path-derived category tag — bare names (no `#` prefix).
 *
 * Re-runs are idempotent. Files removed from disk are pruned from the
 * database so the doc set tracks the repository exactly for files under
 * the size cap. See issue #106.
 *
 * Public API re-exports from the sub-modules:
 *   {@link DOCS_SYNC_SOURCE},
 *   {@link DocsSyncOptions}, {@link DocsSyncResult},
 *   {@link generateDocsId}, {@link categoryTagForRelPath},
 *   {@link syncDocsDirectory}, {@link formatDocsSyncResult}
 *
 * @module
 */
import { basename, relative, resolve, sep } from "path";
import { stat } from "fs/promises";
import type Database from "better-sqlite3";
import { log } from "@/lib/logger";
import {
  type DocsSyncOptions,
  type DocsSyncResult,
  type SyncFailure,
} from "./docs-sync/types";
import { walkMarkdownFiles } from "./docs-sync/discovery";
import { generateDocsId, processFile, pruneMissing } from "./docs-sync/db-ops";

// ── Public re-exports ─────────────────────────────────────────────
export { DOCS_SYNC_SOURCE } from "./docs-sync/types";
export type { DocsSyncOptions, DocsSyncResult } from "./docs-sync/types";
export { generateDocsId } from "./docs-sync/db-ops";
export { categoryTagForRelPath } from "./docs-sync/tags";

/**
 * Sync every `.md` file under `dir` (recursively) into the database as a
 * `note` content item tagged as documentation. Idempotent: re-running on
 * an unchanged tree only touches rows whose on-disk content changed.
 *
 * After importing, rows whose source files no longer exist on disk are
 * removed so the database tracks the repository exactly for files under
 * the size cap.
 *
 * @param db      Open better-sqlite3 connection. The caller owns its lifecycle.
 * @param dir     Absolute path to the docs directory (default `docs/`).
 * @param options.skipUnchanged (default `true`) skip unchanged files.
 * @param options.dryRun        (default `false`) preview without writing.
 */
export async function syncDocsDirectory(
  db: Database.Database,
  dir: string,
  options: DocsSyncOptions = {}
): Promise<DocsSyncResult> {
  const { skipUnchanged = true, dryRun = false } = options;
  const root = resolve(dir);
  const docsRootName = basename(root);

  let total = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let deleted = 0;
  let failed = 0;
  const failures: SyncFailure[] = [];
  const currentIds = new Set<string>();

  // ── validate and discover ──
  let files: string[];
  try {
    const stats = await stat(root);
    if (!stats.isDirectory()) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        deleted: 0,
        failed: 1,
        failures: [{ relPath: root, reason: "Sync path is not a directory" }],
        total: 0,
        directory: root,
        dryRun,
      };
    }
    files = await walkMarkdownFiles(root);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 1,
      failures: [{ relPath: root, reason }],
      total: 0,
      directory: root,
      dryRun,
    };
  }

  total = files.length;

  // ── per-file processing ──
  for (const absPath of files) {
    const relPath = relative(root, absPath).split(sep).join("/");
    const id = generateDocsId(relPath);
    currentIds.add(id);

    try {
      const outcome = await processFile(
        db,
        absPath,
        relPath,
        id,
        docsRootName,
        {
          skipUnchanged,
          dryRun,
        }
      );
      if (outcome === "created") created += 1;
      else if (outcome === "updated") updated += 1;
      else if (outcome === "skipped") skipped += 1;
      else {
        failures.push({ relPath, reason: outcome });
        failed += 1;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log("error", "docs sync failed for file", { relPath, reason });
      failures.push({ relPath, reason });
      failed += 1;
    }
  }

  // ── prune orphaned rows ──
  deleted = pruneMissing(db, currentIds, { dryRun });

  return {
    created,
    updated,
    skipped,
    deleted,
    failed,
    failures,
    total,
    directory: root,
    dryRun,
  };
}

/**
 * Format a {@link DocsSyncResult} as a human-readable multi-line summary
 * for CLI output.
 */
export function formatDocsSyncResult(result: DocsSyncResult): string {
  const label = result.dryRun ? "Docs sync (dry run)" : "Docs sync";
  const lines = [
    `${label} from ${result.directory}`,
    `  discovered: ${result.total}`,
    `  created:    ${result.created}`,
    `  updated:    ${result.updated}`,
    `  skipped:    ${result.skipped}`,
    `  deleted:    ${result.deleted}`,
    `  failed:     ${result.failed}`,
  ];
  if (result.failures.length > 0) {
    lines.push("  failures:");
    for (const f of result.failures) {
      lines.push(`    - ${f.relPath}: ${f.reason}`);
    }
  }
  return lines.join("\n");
}
