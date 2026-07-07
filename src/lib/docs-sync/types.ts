/**
 * Shared types and constants for the docs sync system.
 *
 * @module
 */

/** `content_items.source` value for rows owned by the docs syncer. */
export const DOCS_SYNC_SOURCE = "docs-sync";

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

/** Internal type — a single file that failed to sync. */
export interface SyncFailure {
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
