import { describe, it, expect } from "vitest";
import {
  computeDaysSince,
  severityFromDays,
  deriveBackupStatus,
  formatBackupAge,
  BACKUP_SNOOZE_LIMIT,
  SNOOZE_DURATION_MS,
  BACKUP_SNOOZE_STORAGE_KEY,
} from "@/lib/backup/severity";

const NOW = 1_700_000_000_000; // fixed timestamp for determinism (Nov 2023)

describe("computeDaysSince", () => {
  it("returns null for null input", () => {
    expect(computeDaysSince(null, NOW)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(computeDaysSince("", NOW)).toBeNull();
  });

  it("returns null for unparseable timestamp", () => {
    expect(computeDaysSince("not-a-date", NOW)).toBeNull();
  });

  it("returns 0 for a timestamp now", () => {
    const iso = new Date(NOW).toISOString();
    expect(computeDaysSince(iso, NOW)).toBe(0);
  });

  it("returns correct whole days for a past timestamp", () => {
    const fiveDaysAgo = NOW - 5 * 86_400_000;
    expect(computeDaysSince(new Date(fiveDaysAgo).toISOString(), NOW)).toBe(5);
  });

  it("returns 0 for future timestamp (clamped)", () => {
    const future = NOW + 2 * 86_400_000;
    expect(computeDaysSince(new Date(future).toISOString(), NOW)).toBe(0);
  });
});

describe("severityFromDays", () => {
  it("returns enforce for null (never backed up)", () => {
    expect(severityFromDays(null)).toBe("enforce");
  });

  it("returns hidden for 0–6 days", () => {
    for (const d of [0, 1, 3, 6]) {
      expect(severityFromDays(d)).toBe("hidden");
    }
  });

  it("returns gentle for 7–10 days", () => {
    for (const d of [7, 8, 10]) {
      expect(severityFromDays(d)).toBe("gentle");
    }
  });

  it("returns prominent for 11–13 days", () => {
    for (const d of [11, 12, 13]) {
      expect(severityFromDays(d)).toBe("prominent");
    }
  });

  it("returns enforce for 14+ days", () => {
    for (const d of [14, 30, 999]) {
      expect(severityFromDays(d)).toBe("enforce");
    }
  });
});

describe("formatBackupAge", () => {
  it("returns never for null", () => {
    expect(formatBackupAge(null)).toBe("never");
  });

  it("returns singular day copy for 1", () => {
    expect(formatBackupAge(1)).toBe("1 day ago");
  });

  it("returns plural days for 2–6", () => {
    expect(formatBackupAge(2)).toBe("2 days ago");
    expect(formatBackupAge(6)).toBe("6 days ago");
  });

  it("returns over a week ago for 7+", () => {
    expect(formatBackupAge(7)).toBe("over a week ago");
    expect(formatBackupAge(20)).toBe("over a week ago");
  });
});

describe("deriveBackupStatus", () => {
  it("returns enforce with daysSince=null and snoozeCount=0 when never backed up", () => {
    const s = deriveBackupStatus(null, 0, NOW);
    expect(s.lastBackupAt).toBeNull();
    expect(s.snoozeCount).toBe(0);
    expect(s.daysSince).toBeNull();
    expect(s.severity).toBe("enforce");
  });

  it("computes correct status for a recent backup", () => {
    const twoDaysAgo = new Date(NOW - 2 * 86_400_000).toISOString();
    const s = deriveBackupStatus(twoDaysAgo, 0, NOW);
    expect(s.daysSince).toBe(2);
    expect(s.severity).toBe("hidden");
  });

  it("carries snoozeCount through unchanged", () => {
    const twoDaysAgo = new Date(NOW - 2 * 86_400_000).toISOString();
    const s = deriveBackupStatus(twoDaysAgo, 2, NOW);
    expect(s.snoozeCount).toBe(2);
  });
});

describe("constants", () => {
  it("exports the snooze limit (3)", () => {
    expect(BACKUP_SNOOZE_LIMIT).toBe(3);
  });

  it("exports 1-day duration in ms", () => {
    expect(SNOOZE_DURATION_MS).toBe(86_400_000);
  });

  it("exports the localStorage key name", () => {
    expect(BACKUP_SNOOZE_STORAGE_KEY).toBe("sb_backup_snoozed_until");
  });
});
