/**
 * Backup-reminder escalation logic.
 *
 * Pure, server-and-client safe — no database or Node imports. The DB-aware
 * {@link readBackupStatus} lives in `./reminder.ts` (server-only); this module
 * holds only the escalation curve and the shared {@link BackupStatus} shape so
 * the reminder banner (a client component) can re-derive the live severity
 * from `lastBackupAt` without pulling better-sqlite3 into the browser bundle.
 *
 * Escalation thresholds:
 *
 *   - 0–6 days  → hidden    (no banner)
 *   - 7–10 days → gentle    (muted, dismissible for 1 day)
 *   - 11–13 days → prominent (warning, snooze 1 day / mark)
 *   - 14+ days  → enforce   (full-screen interstitial; after
 *                            {@link BACKUP_SNOOZE_LIMIT} snoozes only "Mark as
 *                            backed up" remains)
 *
 * A missing/empty/unparseable `lastBackupAt` is treated as "never" → enforce.
 */

export type BackupSeverity = "hidden" | "gentle" | "prominent" | "enforce";

export interface BackupStatus {
  /** ISO 8601 timestamp, or `null` when never backed up. */
  lastBackupAt: string | null;
  /** Consecutive snoozes at the 14+ severity. Reset to 0 on "Mark as backed up". */
  snoozeCount: number;
  /** Whole days since `lastBackupAt`, or `null` when never backed up. */
  daysSince: number | null;
  /** Derived from `daysSince` (never → enforce). */
  severity: BackupSeverity;
}

/** After this many consecutive 14+ snoozes, the snooze button disappears. */
export const BACKUP_SNOOZE_LIMIT = 3;

const MS_PER_DAY = 86_400_000;

export const SNOOZE_DURATION_MS = MS_PER_DAY;

/** localStorage key tracking the "hide the reminder until" timestamp. */
export const BACKUP_SNOOZE_STORAGE_KEY = "sb_backup_snoozed_until";

/**
 * Whole days between `now` and `lastBackupAt`. Returns `null` when there is
 * no backup timestamp or it cannot be parsed — callers treat that as "never".
 */
export function computeDaysSince(
  lastBackupAt: string | null,
  now: number = Date.now()
): number | null {
  if (!lastBackupAt) return null;
  const ts = Date.parse(lastBackupAt);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((now - ts) / MS_PER_DAY));
}

/** Map an elapsed-days value to a reminder severity. `null` → enforce. */
export function severityFromDays(daysSince: number | null): BackupSeverity {
  if (daysSince === null) return "enforce";
  if (daysSince <= 6) return "hidden";
  if (daysSince <= 10) return "gentle";
  if (daysSince <= 13) return "prominent";
  return "enforce";
}

/** Human-readable "last backup" copy for banners and the backup guide. */
export function formatBackupAge(daysSince: number | null): string {
  if (daysSince === null) return "never";
  if (daysSince === 1) return "1 day ago";
  if (daysSince >= 7) return "over a week ago";
  return `${daysSince} days ago`;
}

/**
 * Derive the full {@link BackupStatus} from its two inputs. Pure — usable on
 * both server and client so the banner can recompute the live severity from a
 * stale `lastBackupAt` prop after a long-open tab crosses a day boundary.
 */
export function deriveBackupStatus(
  lastBackupAt: string | null,
  snoozeCount: number,
  now: number = Date.now()
): BackupStatus {
  const daysSince = computeDaysSince(lastBackupAt, now);
  return {
    lastBackupAt,
    snoozeCount,
    daysSince,
    severity: severityFromDays(daysSince),
  };
}
