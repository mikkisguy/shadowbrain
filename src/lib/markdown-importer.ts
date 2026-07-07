import { createHash, randomUUID } from "crypto";
import { readFile, stat } from "fs/promises";
import { relative, resolve, sep } from "path";
import matter from "gray-matter";
import type Database from "better-sqlite3";
import { contentItems, auditLogs } from "@/db/index";
import { log } from "@/lib/logger";
import { MAX_FILE_BYTES, walkMarkdownFiles } from "./markdown-walker";

export interface ParsedMarkdown {
  /**
   * Filename without extension (e.g. `2024-01-15-reading-list.md` → `2024-01-15-reading-list`).
   * Always provided, even when the file has a frontmatter `title` — the filename
   * title is the fallback / default per the issue spec.
   */
  filenameTitle: string;
  /** Frontmatter object as a plain record, or `null` when absent / unparseable. */
  frontmatter: Record<string, unknown> | null;
  /** Markdown body with frontmatter stripped. */
  body: string;
  /**
   * Path of the file relative to the import root, using forward slashes
   * (e.g. `topics/2024-reading-list.md`). Stable across platforms.
   */
  relPath: string;
}

export interface ImportOptions {
  /**
   * If `true`, files whose content has not changed since the last import
   * are skipped entirely (no DB write, no audit log). Defaults to `true`.
   */
  skipUnchanged?: boolean;
}

interface ImportFailure {
  relPath: string;
  reason: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: ImportFailure[];
  /** Total `.md` files discovered (recursively). */
  total: number;
  /** Absolute path of the directory that was imported. */
  directory: string;
}

/**
 * Parse a single markdown file's raw text into its component parts.
 * Pure function — no filesystem or DB access. Exposed for unit tests.
 *
 * Frontmatter that fails to parse is logged and treated as absent:
 * the body is the entire file and `frontmatter` is `null`. The caller
 * can detect the failure via {@link ParsedMarkdown.frontmatter} being
 * `null` while the body still contains a leading `---` line.
 */
export function parseMarkdownFile(
  raw: string,
  relPath: string
): ParsedMarkdown {
  const filenameTitle = relPath.replace(/\.md$/i, "").split("/").pop()!;

  let frontmatter: Record<string, unknown> | null = null;
  let body = raw;

  // gray-matter throws on malformed YAML; we want the import to be
  // resilient — a single broken file should not abort the whole run.
  try {
    const parsed = matter(raw);
    frontmatter =
      parsed.data && Object.keys(parsed.data).length > 0
        ? (parsed.data as Record<string, unknown>)
        : null;
    body = parsed.content.trimEnd();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log("warn", "markdown frontmatter parse failed; importing body only", {
      relPath,
      reason,
    });
    // Strip a leading `---` line so the body doesn't start with a
    // dangling delimiter when we ignore the malformed frontmatter.
    body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trimEnd();
  }

  return { filenameTitle, frontmatter, body, relPath };
}

/**
 * Produce a stable, UUID-shaped identifier for a markdown file.
 * The id is deterministic from the file's path relative to the import
 * root, so re-running the import on the same file targets the same
 * content_item row (idempotency).
 *
 * Format: `note-md-<32 hex chars>`. The prefix is human-readable
 * in `audit_logs` / debug output and makes it obvious the row was
 * created by the markdown importer.
 *
 * **Caveat:** the id is derived from the *relative* path only. If you
 * import `--dir /a/notes/hello.md` and then import `--dir /b/notes/hello.md`
 * (different absolute roots, same relative path), the second run will
 * overwrite the first. Use a single import root per ShadowBrain install
 * unless you want this behaviour.
 */
export function generateStableId(relPath: string): string {
  const hash = createHash("sha256").update(relPath).digest("hex");
  return `note-md-${hash.slice(0, 32)}`;
}

function frontmatterToMetadata(
  fm: Record<string, unknown> | null
): string | null {
  if (!fm) return null;
  return JSON.stringify(fm);
}

/**
 * Import every `.md` file under `dir` (recursively) as a `note`
 * content_item. Idempotent — re-running on an unchanged tree is a
 * no-op; re-running after edits updates the existing rows.
 *
 * Each file is upserted in its own `db.transaction` so a mid-run
 * crash cannot leave a `content_item` row without its `audit_logs`
 * companion (or vice versa).
 *
 * @param db      Open better-sqlite3 connection. The caller owns the
 *                connection's lifecycle.
 * @param dir     Absolute path to the directory to import.
 * @param options.skipUnchanged (default `true`) skip files whose
 *                stored content and metadata match the on-disk file.
 */
export async function importMarkdownDirectory(
  db: Database.Database,
  dir: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { skipUnchanged = true } = options;
  const root = resolve(dir);

  let total = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: ImportFailure[] = [];

  let files: string[];
  try {
    const stats = await stat(root);
    if (!stats.isDirectory()) {
      return {
        created,
        updated,
        skipped,
        failed: 1,
        failures: [{ relPath: root, reason: "Import path is not a directory" }],
        total: 0,
        directory: root,
      };
    }
    files = await walkMarkdownFiles(root);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      created,
      updated,
      skipped,
      failed: 1,
      failures: [{ relPath: root, reason }],
      total: 0,
      directory: root,
    };
  }

  total = files.length;

  for (const absPath of files) {
    const relPath = relative(root, absPath).split(sep).join("/");
    try {
      const stats = await stat(absPath);
      if (stats.size > MAX_FILE_BYTES) {
        const reason = `File too large (${stats.size} bytes > ${MAX_FILE_BYTES})`;
        log("warn", "markdown import skipped", { relPath, reason });
        failures.push({ relPath, reason });
        failed += 1;
        continue;
      }

      const raw = await readFile(absPath, "utf-8");
      const parsed = parseMarkdownFile(raw, relPath);
      const id = generateStableId(relPath);
      const now = new Date().toISOString();
      const metadata = frontmatterToMetadata(parsed.frontmatter);

      // Per-file transaction: the content_item upsert and its
      // audit_log entry must succeed or fail together so we never
      // leave the two tables out of sync.
      const perFileTx = db.transaction(() => {
        // The importer is a system-level operation, not a browse view —
        // it must see hidden / private items so a re-import of a
        // previously imported private file can update it instead of
        // accidentally re-inserting (which would hit the PRIMARY KEY
        // and throw SQLITE_CONSTRAINT).
        const existing = contentItems.findById(db, id, {
          includeHidden: true,
          includePrivate: true,
        });
        if (existing) {
          const contentUnchanged = existing.content === parsed.body;
          const metaUnchanged = existing.metadata === metadata;
          if (skipUnchanged && contentUnchanged && metaUnchanged) {
            // Returning a sentinel so the outer loop can count it
            // without re-querying.
            return "skipped" as const;
          }
          contentItems.update(db, id, {
            content: parsed.body,
            // Pass `metadata` directly (including `null`) so a file
            // that loses its frontmatter has the column cleared
            // instead of silently retaining the previous value.
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
              source: "markdown",
              relPath,
              op: "update",
            }),
            created_at: now,
          });
          return "updated" as const;
        }

        contentItems.create(db, {
          id,
          type: "note",
          title: parsed.filenameTitle,
          content: parsed.body,
          source: "markdown-import",
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
            source: "markdown",
            relPath,
            op: "create",
          }),
          created_at: now,
        });
        return "created" as const;
      });

      const outcome = perFileTx();
      if (outcome === "created") created += 1;
      else if (outcome === "updated") updated += 1;
      else skipped += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log("error", "markdown import failed for file", {
        relPath,
        reason,
      });
      failures.push({ relPath, reason });
      failed += 1;
    }
  }

  return {
    created,
    updated,
    skipped,
    failed,
    failures,
    total,
    directory: root,
  };
}

/**
 * Format an {@link ImportResult} as a human-readable multi-line
 * summary suitable for CLI output.
 */
export function formatImportResult(result: ImportResult): string {
  const lines = [
    `Markdown import from ${result.directory}`,
    `  discovered: ${result.total}`,
    `  created:    ${result.created}`,
    `  updated:    ${result.updated}`,
    `  skipped:    ${result.skipped}`,
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
