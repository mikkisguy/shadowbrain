/**
 * CLI entry point for the journal-shadows → ShadowBrain migration.
 *
 * Opens the legacy `journal.db` in read-only mode, reads every
 * `journal_entries`, `raw_entries`, `note_names`, and `settings` row,
 * maps each one through the pure functions in
 * `@/lib/journal-shadows-migrator`, and inserts the result into the
 * ShadowBrain database. Re-running is safe — every insert uses
 * `INSERT OR IGNORE` keyed on the source id, so an already-migrated
 * row is left untouched.
 *
 * Usage:
 *   pnpm migrate:journal-shadows
 *   pnpm migrate:journal-shadows --source /path/to/journal.db
 *   pnpm migrate:journal-shadows --dry-run
 *   pnpm migrate:journal-shadows --validate
 *
 * Flags:
 *   --source, -s  Path to the legacy journal.db (default:
 *                 $JOURNAL_SHADOWS_DB or
 *                 ../journal-shadows/data/journal.db)
 *   --dry-run     Read and count, but write nothing. Exits 0 on a
 *                 clean read so CI can sanity-check the legacy file.
 *   --validate    After inserting, re-count source rows vs. dest rows
 *                 and exit non-zero on a mismatch. Off by default —
 *                 the default behaviour is best-effort with a printed
 *                 summary.
 *   --help, -h    Show this help text.
 */
import { existsSync } from "fs";
import { resolve, isAbsolute } from "path";
import Database from "better-sqlite3";
import {
  getDb,
  closeDb,
  contentItems,
  journalPeriods,
  settings as settingsRepo,
  auditLogs,
} from "@/db/index";
import {
  mapJournalEntry,
  mapRawEntry,
  mapNoteName,
  mapJournalPeriod,
  mapSettings,
  type LegacyJournalEntry,
  type LegacyRawEntry,
  type LegacyNoteName,
  type LegacySetting,
  LEGACY_SOURCE,
} from "@/lib/journal-shadows-migrator";
import { log } from "@/lib/logger";

interface CliArgs {
  source: string;
  dryRun: boolean;
  validate: boolean;
}

interface Counts {
  journal_entries: number;
  raw_entries: number;
  note_names: number;
  settings: number;
  raw_text: number;
  raw_image: number;
}

interface ImportTotals {
  journalItems: number;
  journalPeriods: number;
  rawItems: number;
  noteItems: number;
  settingsKept: number;
  settingsDropped: number;
  sourceCounts: Counts;
}

function defaultSourcePath(): string {
  if (process.env.JOURNAL_SHADOWS_DB) {
    return process.env.JOURNAL_SHADOWS_DB;
  }
  // Sibling project, conventional layout.
  return resolve(process.cwd(), "..", "journal-shadows", "data", "journal.db");
}

function parseArgs(argv: string[]): CliArgs {
  let source: string | null = null;
  let dryRun = false;
  let validate = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source" || arg === "-s") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--source requires a path argument");
      }
      source = next;
      i += 1;
    } else if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--validate") {
      validate = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    source: source ?? defaultSourcePath(),
    dryRun,
    validate,
  };
}

function printHelp(): void {
  console.log(`Usage: pnpm migrate:journal-shadows [options]

Reads the legacy journal-shadows SQLite database and imports its content
into the ShadowBrain database configured by the current NODE_ENV.

Options:
  -s, --source <path>  Path to the legacy journal.db
                       (default: $JOURNAL_SHADOWS_DB or
                        ../journal-shadows/data/journal.db)
      --dry-run        Read and count only. Exits 0 on a clean read.
      --validate       After insert, compare dest counts to source counts
                       and exit non-zero on a mismatch.
  -h, --help           Show this help

The migration is idempotent — every insert is keyed on the source id
and uses INSERT OR IGNORE, so re-running on the same source is safe
and leaves already-migrated rows untouched.
`);
}

function openLegacyDb(path: string): Database.Database {
  if (!existsSync(path)) {
    throw new Error(
      `Legacy database not found at ${path}. Pass --source <path> or set JOURNAL_SHADOWS_DB.`
    );
  }
  // `readonly: true` is the documented better-sqlite3 option for
  // opening a DB without taking a write lock. The legacy file may
  // be live (we have seen it in WAL mode) and we must not interfere.
  // The legacy file is already in WAL mode, so we don't toggle the
  // journal mode here — that would require write access.
  const db = new Database(path, { readonly: true, fileMustExist: true });
  return db;
}

function requireTables(db: Database.Database, tables: string[]): void {
  const present = new Set(
    (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{
        name: string;
      }>
    ).map((row) => row.name)
  );
  const missing = tables.filter((t) => !present.has(t));
  if (missing.length > 0) {
    throw new Error(
      `Legacy database is missing required tables: ${missing.join(", ")}. ` +
        `Expected at least: ${tables.join(", ")}.`
    );
  }
}

function readCountsFromRows(
  journalEntries: ReadonlyArray<LegacyJournalEntry>,
  rawEntries: ReadonlyArray<LegacyRawEntry>,
  noteNames: ReadonlyArray<LegacyNoteName>,
  settings: ReadonlyArray<LegacySetting>
): Counts {
  return {
    journal_entries: journalEntries.length,
    raw_entries: rawEntries.length,
    note_names: noteNames.length,
    settings: settings.length,
    raw_text: rawEntries.filter((r) => r.type === "text").length,
    raw_image: rawEntries.filter((r) => r.type === "image").length,
  };
}

/**
 * Cheap pre-flight row count read from the legacy DB without
 * materialising full row bodies. Used in --dry-run so the operator
 * can see how many rows are coming without paying the read cost.
 */
function readCounts(legacy: Database.Database): Counts {
  const get = (sql: string): number =>
    (legacy.prepare(sql).get() as { c: number }).c;
  return {
    journal_entries: get("SELECT COUNT(*) AS c FROM journal_entries"),
    raw_entries: get("SELECT COUNT(*) AS c FROM raw_entries"),
    note_names: get("SELECT COUNT(*) AS c FROM note_names"),
    settings: get("SELECT COUNT(*) AS c FROM settings"),
    raw_text: get("SELECT COUNT(*) AS c FROM raw_entries WHERE type = 'text'"),
    raw_image: get(
      "SELECT COUNT(*) AS c FROM raw_entries WHERE type = 'image'"
    ),
  };
}

function formatCounts(c: Counts): string {
  return [
    `  journal_entries: ${c.journal_entries}`,
    `  raw_entries:     ${c.raw_entries} (text=${c.raw_text}, image=${c.raw_image})`,
    `  note_names:      ${c.note_names}`,
    `  settings:        ${c.settings}`,
  ].join("\n");
}

function formatTotals(t: ImportTotals): string {
  return [
    `Migration from ${LEGACY_SOURCE} complete`,
    `  journal items inserted:    ${t.journalItems} / ${t.sourceCounts.journal_entries}`,
    `  journal periods inserted:  ${t.journalPeriods}`,
    `  raw items inserted:        ${t.rawItems} / ${t.sourceCounts.raw_entries}`,
    `  note items inserted:       ${t.noteItems} / ${t.sourceCounts.note_names}`,
    `  settings kept:             ${t.settingsKept}`,
    `  settings dropped (secrets/stale): ${t.settingsDropped}`,
  ].join("\n");
}

function readLegacyRows(legacy: Database.Database): {
  journalEntries: LegacyJournalEntry[];
  rawEntries: LegacyRawEntry[];
  noteNames: LegacyNoteName[];
  settings: LegacySetting[];
} {
  return {
    journalEntries: legacy
      .prepare("SELECT * FROM journal_entries")
      .all() as LegacyJournalEntry[],
    rawEntries: legacy
      .prepare("SELECT * FROM raw_entries ORDER BY created_at")
      .all() as LegacyRawEntry[],
    noteNames: legacy
      .prepare("SELECT * FROM note_names")
      .all() as LegacyNoteName[],
    settings: legacy.prepare("SELECT * FROM settings").all() as LegacySetting[],
  };
}

function importAll(
  dest: Database.Database,
  rows: ReturnType<typeof readLegacyRows>,
  sourceCounts: Counts,
  dryRun: boolean
): ImportTotals {
  const now = new Date().toISOString();

  const totals: ImportTotals = {
    journalItems: 0,
    journalPeriods: 0,
    rawItems: 0,
    noteItems: 0,
    settingsKept: 0,
    settingsDropped: 0,
    sourceCounts,
  };

  if (dryRun) {
    return totals;
  }

  // All writes go in a single transaction so a mid-migration crash
  // leaves the dest DB untouched (better-sqlite3's `db.transaction`
  // rolls back on any throw).
  dest.transaction(() => {
    // 1) Journal entries + their period rows.
    for (const row of rows.journalEntries) {
      const mapped = mapJournalEntry(row);
      const inserted = contentItems.createOrIgnore(dest, mapped);
      if (inserted.changes > 0) totals.journalItems += 1;

      if (row.period_start && row.period_end) {
        const period = mapJournalPeriod(
          row.id,
          row.period_start,
          row.period_end,
          rows.rawEntries
        );
        // createOrIgnore is a no-op on a re-run for an entry that
        // was already migrated, so this is safe and idempotent.
        const periodInserted = journalPeriods.createOrIgnore(dest, period);
        if (periodInserted.changes > 0) totals.journalPeriods += 1;
      }
    }

    // 2) Raw entries.
    for (const row of rows.rawEntries) {
      const mapped = mapRawEntry(row);
      const inserted = contentItems.createOrIgnore(dest, mapped);
      if (inserted.changes > 0) totals.rawItems += 1;
    }

    // 3) Note names (display name + path only — body lives in .md
    // files and is loaded by the markdown importer, not here).
    for (const row of rows.noteNames) {
      const mapped = mapNoteName(row);
      // INSERT OR IGNORE on a primary-key conflict. If a note with
      // this id already exists (e.g. the markdown importer ran
      // first), we don't overwrite it.
      const inserted = contentItems.createOrIgnore(dest, mapped);
      if (inserted.changes > 0) totals.noteItems += 1;
    }

    // 4) Settings — blocklist already applied by the pure mapper.
    // Use createOrIgnore so a re-run of the script (after the user
    // has since changed `ai_model` in the new app) doesn't
    // silently clobber the newer value. Mirrors the contract used
    // for content_items and journal_periods.
    const { kept, dropped } = mapSettings(rows.settings);
    for (const s of kept) {
      settingsRepo.createOrIgnore(dest, s);
      totals.settingsKept += 1;
    }
    totals.settingsDropped = dropped.length;
    for (const d of dropped) {
      log("info", "legacy setting dropped", { key: d.key, reason: d.reason });
    }
  })();

  // One audit log entry per *run*, not per row, so the audit table
  // doesn't get blown up by a 137-row import.
  auditLogs.create(dest, {
    id: cryptoRandomUUID(),
    actor_type: "system",
    action: "migration.run",
    entity_type: "migration",
    entity_id: null,
    success: 1,
    metadata: JSON.stringify({
      source: LEGACY_SOURCE,
      ...totals,
      ranAt: now,
    }),
    created_at: now,
  });

  return totals;
}

// crypto.randomUUID is available in Node 19+. Fall back to a
// timestamp+random uuid-shaped string in case the runtime is older.
function cryptoRandomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function validate(
  dest: Database.Database,
  sourceCounts: Counts
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  // Journal items in the new app only ever come from this migration
  // (the `type='journal'` value is reserved), so no `source` filter
  // is needed here. Raws and notes can also originate from other
  // import paths (markdown, web, Discord), so we filter those by
  // `source = 'journal-shadows'` to get the migrated subset.
  const destJournal = (
    dest
      .prepare("SELECT COUNT(*) AS c FROM content_items WHERE type = 'journal'")
      .get() as { c: number }
  ).c;
  const destRaw = (
    dest
      .prepare(
        "SELECT COUNT(*) AS c FROM content_items WHERE type IN ('raw_text', 'image') AND source = ?"
      )
      .get(LEGACY_SOURCE) as { c: number }
  ).c;
  const destNotes = (
    dest
      .prepare(
        "SELECT COUNT(*) AS c FROM content_items WHERE type = 'note' AND source = ?"
      )
      .get(LEGACY_SOURCE) as { c: number }
  ).c;
  const destPeriods = (
    dest.prepare("SELECT COUNT(*) AS c FROM journal_periods").get() as {
      c: number;
    }
  ).c;

  // Validation is best-effort: dest counts must be >= source counts
  // (a previous partial run could already have moved some rows).
  if (destJournal < sourceCounts.journal_entries) {
    mismatches.push(
      `journal items: dest=${destJournal} < source=${sourceCounts.journal_entries}`
    );
  }
  if (destRaw < sourceCounts.raw_entries) {
    mismatches.push(
      `raw items: dest=${destRaw} < source=${sourceCounts.raw_entries}`
    );
  }
  if (destNotes < sourceCounts.note_names) {
    mismatches.push(
      `note items: dest=${destNotes} < source=${sourceCounts.note_names}`
    );
  }
  if (
    sourceCounts.journal_entries > 0 &&
    destPeriods < sourceCounts.journal_entries
  ) {
    mismatches.push(
      `journal periods: dest=${destPeriods} < source=${sourceCounts.journal_entries}`
    );
  }
  // No orphan periods (period.content_id must exist in content_items).
  const orphans = (
    dest
      .prepare(
        `SELECT COUNT(*) AS c FROM journal_periods jp
         LEFT JOIN content_items ci ON ci.id = jp.content_id
         WHERE ci.id IS NULL`
      )
      .get() as { c: number }
  ).c;
  if (orphans > 0) {
    mismatches.push(`orphan journal_periods: ${orphans}`);
  }
  // All journal items should have a matching journal_periods row.
  const journalWithoutPeriod = (
    dest
      .prepare(
        `SELECT COUNT(*) AS c FROM content_items ci
         LEFT JOIN journal_periods jp ON jp.content_id = ci.id
         WHERE ci.type = 'journal' AND jp.content_id IS NULL`
      )
      .get() as { c: number }
  ).c;
  if (journalWithoutPeriod > 0) {
    mismatches.push(`journal items without period: ${journalWithoutPeriod}`);
  }

  return { ok: mismatches.length === 0, mismatches };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Argument error: ${message}`);
    printHelp();
    process.exit(2);
  }

  // Resolve the source path relative to cwd when not absolute so the
  // default (`../journal-shadows/data/journal.db`) behaves intuitively
  // from the repo root and from inside `scripts/`.
  const sourcePath = isAbsolute(args.source)
    ? args.source
    : resolve(process.cwd(), args.source);

  console.log(`Opening legacy database at ${sourcePath} (read-only)…`);
  const legacy = openLegacyDb(sourcePath);
  try {
    requireTables(legacy, [
      "journal_entries",
      "raw_entries",
      "note_names",
      "settings",
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${message}`);
    process.exit(1);
  }

  const sourceCounts = readCounts(legacy);
  console.log(`Source row counts:\n${formatCounts(sourceCounts)}`);

  if (args.dryRun) {
    console.log(
      `\n--dry-run set; not opening the destination DB. Use without --dry-run to import.`
    );
    log("info", "journal-shadows migration dry-run", {
      event: "migration.dry_run",
      source: sourcePath,
      counts: sourceCounts,
    });
    legacy.close();
    return;
  }

  const rows = readLegacyRows(legacy);
  legacy.close();

  console.log(`\nOpening destination database…`);
  const dest = getDb();
  try {
    // Re-derive counts from the in-memory rows we just read so the
    // `totals` report reflects the rows we're actually about to
    // import (single source of truth for counts).
    const counts = readCountsFromRows(
      rows.journalEntries,
      rows.rawEntries,
      rows.noteNames,
      rows.settings
    );
    const totals = importAll(dest, rows, counts, false);
    console.log(`\n${formatTotals(totals)}`);
    log("info", "journal-shadows migration complete", {
      event: "migration.complete",
      source: sourcePath,
      ...totals,
    });

    if (args.validate) {
      const v = validate(dest, sourceCounts);
      if (v.ok) {
        console.log(`\nValidation: OK (no orphans, no missing rows).`);
      } else {
        console.error(`\nValidation: FAILED`);
        for (const m of v.mismatches) {
          console.error(`  - ${m}`);
        }
        process.exitCode = 1;
      }
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Migration failed: ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  log("error", "journal-shadows migration crashed", {
    event: "migration.crash",
    error: err instanceof Error ? { message, stack: err.stack } : message,
  });
  process.exit(1);
});
