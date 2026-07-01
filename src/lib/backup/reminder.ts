/**
 * Server-only backup-reminder helpers.
 *
 * Reads the settings table to produce a {@link BackupStatus}. Pure
 * escalation logic lives in `./severity.ts` (client-safe); this module
 * adds the DB access layer.
 */

import type Database from "better-sqlite3";
import { settings } from "@/db/index";
import { deriveBackupStatus, type BackupStatus } from "./severity";

/**
 * Normalize a settings value: `null`, `undefined`, or whitespace-only
 * strings become `null` so callers don't need to handle empty-string edge
 * cases.
 */
function normalize(value: string | null): string | null {
  return value && value.trim() !== "" ? value : null;
}

/**
 * Parse the stored `backup_snooze_count` as a non-negative integer.
 * Missing, empty, or non-numeric values default to `0`.
 */
function parseSnoozeCount(value: string | null): number {
  if (!value) return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Read the current backup reminder status from the settings table.
 *
 * @param db  A `better-sqlite3` database connection.
 * @param now Optional timestamp (ms since epoch) for deterministic tests.
 *            Defaults to `Date.now()`.
 * @returns   A fully populated {@link BackupStatus}.
 */
export function readBackupStatus(
  db: Database.Database,
  now: number = Date.now()
): BackupStatus {
  const lastBackupAt = normalize(settings.get(db, "last_backup_at"));
  const snoozeCount = parseSnoozeCount(settings.get(db, "backup_snooze_count"));
  return deriveBackupStatus(lastBackupAt, snoozeCount, now);
}
