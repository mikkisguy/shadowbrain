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
 *   category tag derived from its path (see {@link categoryTagForRelPath}).
 *   Tag names are stored without a leading `#`; the web UI renders the
 *   `#` prefix (so a stored `docs` tag displays as `#docs`) and the tag
 *   filter matches on the bare name.
 *
 * Re-runs are idempotent. Files removed from disk are pruned from the
 * database so the doc set tracks the repository exactly for files under
 * the size cap. See issue #106.
 */
import { createHash, randomUUID } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import { basename, extname, join, relative, resolve, sep } from "path";
import type Database from "better-sqlite3";
import { contentItems, contentTags, tags, auditLogs } from "@/db/index";
import { log } from "@/lib/logger";

/**
 * Maximum file size (in bytes) the syncer will read. Matches the markdown
 * importer cap so a stray binary masquerading as `.md` cannot exhaust
 * memory.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** `content_items.source` value for rows owned by the docs syncer. */
export const DOCS_SYNC_SOURCE = "docs-sync";

/** Tag applied to every doc — groups all ShadowBrain content. */
const PROJECT_TAG = "project:shadowbrain";

/** Tag applied to every doc — marks it as documentation. */
const DOCS_TAG = "docs";

export interface DocsSyncOptions {
  /**
   * If `true` (default), files whose content and metadata have not changed
   * since the last sync are skipped (no DB write, no audit log). Set
   * `false` for `--force`, which re-writes every file.
   */
  skipUnchanged?: boolean;
  /**
   * If `true`, compute the full plan (creates / updates / skips / deletes)
   * but write nothing to the database. Used by `--dry-run`.
   */
  dryRun?: boolean;
}

interface SyncFailure {
  relPath: string;
  reason: string;
}

export interface DocsSyncResult {
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
  failed: number;
  failures: SyncFailure[];
  /** Total `.md` files discovered (recursively). */
  total: number;
  /** Absolute path of the directory that was synced. */
  directory: string;
  /** Whether this was a dry run. */
  dryRun: boolean;
}

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
 * Derive the category tag for a doc from its path relative to the sync
 * root.
 *
 * - A file in a subdirectory takes the top-level directory as its
 *   category: `api/endpoints/auth.md` → `docs:api`.
 * - A file at the root takes its filename stem: `getting-started.md` →
 *   `docs:getting-started`.
 *
 * The relative path uses forward slashes regardless of platform.
 */
export function categoryTagForRelPath(relPath: string): string {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    return `docs:${parts[0]}`;
  }
  const stem = parts[0].replace(/\.[^.]+$/, "");
  return `docs:${stem}`;
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
 * Find a tag by name (case-insensitive), creating it if absent. Returns
 * the tag id. Safe to call repeatedly — the second call hits the existing
 * row and does not insert.
 */
function ensureTag(db: Database.Database, name: string, now: string): string {
  const existing = tags.findByName(db, name);
  if (existing) return existing.id;
  const id = randomUUID();
  tags.create(db, { id, name, created_at: now });
  return id;
}

/**
 * Ensure the project, docs, and category tags are all linked to a content
 * item. Uses `INSERT OR IGNORE` so it is idempotent and self-healing: a
 * manually removed tag association is restored on the next sync.
 */
function ensureDocTags(
  db: Database.Database,
  contentId: string,
  relPath: string,
  now: string
): void {
  const tagNames = [PROJECT_TAG, DOCS_TAG, categoryTagForRelPath(relPath)];
  for (const name of tagNames) {
    const tagId = ensureTag(db, name, now);
    contentTags.addTag(db, contentId, tagId, now);
  }
}

/** Files whose name starts with a dot are conventionally hidden / config. */
function isHiddenPath(relPath: string): boolean {
  return relPath.split("/").some((part) => part.startsWith("."));
}

/** Recursively collect every non-hidden `.md` file under `root`. */
async function walkMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (extname(entry.name).toLowerCase() !== ".md") continue;
      const rel = relative(root, full).split(sep).join("/");
      if (isHiddenPath(rel)) continue;
      out.push(full);
    }
  }

  await walk(root);
  out.sort();
  return out;
}

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

  let files: string[];
  try {
    const stats = await stat(root);
    if (!stats.isDirectory()) {
      return {
        created,
        updated,
        skipped,
        deleted,
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
      created,
      updated,
      skipped,
      deleted,
      failed: 1,
      failures: [{ relPath: root, reason }],
      total: 0,
      directory: root,
      dryRun,
    };
  }

  total = files.length;

  for (const absPath of files) {
    const relPath = relative(root, absPath).split(sep).join("/");
    const id = generateDocsId(relPath);
    currentIds.add(id);

    try {
      const fileStats = await stat(absPath);
      if (fileStats.size > MAX_FILE_BYTES) {
        const reason = `File too large (${fileStats.size} bytes > ${MAX_FILE_BYTES})`;
        log("warn", "docs sync skipped", { relPath, reason });
        failures.push({ relPath, reason });
        failed += 1;
        continue;
      }

      const raw = await readFile(absPath, "utf-8");
      const filenameTitle = filenameTitleFromRelPath(relPath);
      const metadata = buildMetadata(docsRootName, relPath);
      const now = new Date().toISOString();

      if (dryRun) {
        const existing = contentItems.findById(db, id, {
          includeHidden: true,
          includePrivate: true,
        });
        if (!existing) {
          created += 1;
        } else if (
          skipUnchanged &&
          existing.content === raw &&
          existing.metadata === metadata
        ) {
          skipped += 1;
        } else {
          updated += 1;
        }
        continue;
      }

      // Per-file transaction: the content_item upsert, its audit_log,
      // and tag associations succeed or fail together.
      const perFileTx = db.transaction(() => {
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
            return "skipped" as const;
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
          return "updated" as const;
        }

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
        return "created" as const;
      });

      const outcome = perFileTx();
      if (outcome === "created") created += 1;
      else if (outcome === "updated") updated += 1;
      else skipped += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log("error", "docs sync failed for file", { relPath, reason });
      failures.push({ relPath, reason });
      failed += 1;
    }
  }

  // Prune docs that no longer exist on disk. A row owned by the docs
  // syncer whose id is not in the current file set corresponds to a
  // deleted file. Cascading FKs remove its content_tags rows. The row's
  // metadata is read back so the prune audit log records the file path
  // (the id alone is an opaque one-way hash).
  const docsRows = db
    .prepare("SELECT id, metadata FROM content_items WHERE source = ?")
    .all(DOCS_SYNC_SOURCE) as Array<{ id: string; metadata: string | null }>;

  if (dryRun) {
    for (const row of docsRows) {
      if (!currentIds.has(row.id)) deleted += 1;
    }
  } else {
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
  }

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
