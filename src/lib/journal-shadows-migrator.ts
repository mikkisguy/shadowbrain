/**
 * Pure mapping functions for migrating data from the legacy
 * `journal-shadows` SQLite database into the ShadowBrain schema.
 *
 * The functions in this module are deliberately decoupled from
 * `better-sqlite3` (they accept plain objects, not live row handles)
 * so they can be unit-tested with hand-crafted fixtures. The actual
 * file I/O and DB writes live in `scripts/migrate-journal-shadows.ts`.
 *
 * Source schema (journal-shadows, 2026-05 snapshot):
 *
 *   journal_entries(id TEXT PK, date DATE, content TEXT,
 *                   period_start DATETIME, period_end DATETIME,
 *                   created_at DATETIME, updated_at DATETIME,
 *                   title TEXT)
 *   raw_entries(id TEXT PK, content TEXT, type TEXT,   -- 'text' | 'image'
 *               image_path TEXT, created_at DATETIME)
 *   note_names(path TEXT PK, display_name TEXT,
 *              created_at DATETIME, updated_at DATETIME)
 *   settings(key TEXT PK, value TEXT)        -- includes secrets; we skip them
 *
 * Destination schema (ShadowBrain, see `src/db/migrations/0001_*`):
 *
 *   content_items(id, type, title, content, image_path, source,
 *                 source_url, metadata, is_private, created_at, updated_at)
 *   journal_periods(content_id PK, period_start, period_end,
 *                   raw_count, model_used)
 *   settings(key, value)
 */
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Source row types — these mirror the journal-shadows table shape exactly.
// Using the same casing as the DB column names so callers can pass rows
// straight from `db.prepare(...).all()` without massaging.
// ---------------------------------------------------------------------------

export interface LegacyJournalEntry {
  id: string;
  date: string;
  content: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
  title: string | null;
}

export interface LegacyRawEntry {
  id: string;
  content: string;
  type: string;
  image_path: string | null;
  created_at: string;
}

export interface LegacyNoteName {
  path: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface LegacySetting {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Destination row types — shaped to be passed to `contentItems.create`,
// `journalPeriods.create`, and `settings.set` directly.
// ---------------------------------------------------------------------------

export interface MappedContentItem {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  metadata: string | null;
  is_private: number;
  created_at: string;
  updated_at: string;
}

export interface MappedJournalPeriod {
  content_id: string;
  period_start: string;
  period_end: string;
  raw_count: number;
  model_used: string | null;
}

export interface MappedSetting {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Constants — keep all magic strings/numbers here so a one-line change
// re-labels every migrated row.
// ---------------------------------------------------------------------------

/** `content_items.source` value for every row imported from journal-shadows. */
export const LEGACY_SOURCE = "journal-shadows";

/** Mapping for the legacy `raw_entries.type` column. */
const RAW_TYPE_MAP: Record<string, string> = {
  text: "raw_text",
  image: "image",
};

/**
 * Settings keys that must NEVER be copied across to the new database.
 *
 * The legacy DB stored a few things that are either no longer relevant
 * (`ollama_url` predates the OpenRouter default), redundant (the new
 * schema already has sensible defaults for `ai_provider` / `ai_model`),
 * or actively dangerous to copy. `password_hash` is the obvious one —
 * the new app uses a different auth model — and any openrouter/groq key
 * from the legacy app would shadow a fresh credential the user just
 * set in `.env`.
 *
 * `hermes_discord_last_message_id` is intentionally NOT in this list.
 * Hermes integration is still part of the ShadowBrain roadmap (see
 * `docs/phases.md` Phase 4) and the legacy value may be useful for
 * resuming a Discord catch-up, so it gets carried over verbatim.
 */
const SETTINGS_BLOCKLIST = new Set<string>([
  "password_hash",
  "openrouter_api_key",
  "groq_api_key",
  // `ollama_url` is stale — the new app talks to OpenRouter by
  // default and the local-ollama code path is no longer wired up.
  "ollama_url",
]);

// ---------------------------------------------------------------------------
// Pure mapping functions.
// ---------------------------------------------------------------------------

/**
 * Map a legacy `journal_entries` row to a ShadowBrain `content_items`
 * row. The legacy id is preserved so any future back-references (in
 * `raw_entries.id` comments, in Discord links, etc.) keep working.
 *
 * `period_start` / `period_end` are NOT written here — they live in the
 * sibling `journal_periods` table. The caller is responsible for
 * inserting that row with the matching `content_id` and the raw
 * count derived from `raw_entries`.
 */
export function mapJournalEntry(row: LegacyJournalEntry): MappedContentItem {
  return {
    id: row.id,
    type: "journal",
    title: row.title,
    content: row.content,
    image_path: null,
    source: LEGACY_SOURCE,
    source_url: null,
    // Keep the legacy `date` in metadata so the entry's "day" is
    // recoverable even if the caller's view of `created_at` differs.
    metadata: JSON.stringify({ legacy_date: row.date }),
    is_private: 0,
    created_at: normalizeToUtcIso(row.created_at),
    updated_at: normalizeToUtcIso(row.updated_at),
  };
}

/**
 * Map a legacy `raw_entries` row to a ShadowBrain `content_items` row.
 *
 * `type='text'` becomes `raw_text`; `type='image'` stays as `image`.
 * Unknown `type` values fall back to `raw_text` and a warning is left
 * for the operator via the `metadata.legacy_type` field. We deliberately
 * do NOT throw on an unknown type — the operator's only sensible action
 * is to keep the row, log it, and move on.
 */
export function mapRawEntry(row: LegacyRawEntry): MappedContentItem {
  const mappedType = RAW_TYPE_MAP[row.type] ?? "raw_text";
  const noteUnknownType = !RAW_TYPE_MAP[row.type];

  const metadata = noteUnknownType
    ? JSON.stringify({ legacy_type: row.type })
    : null;

  return {
    id: row.id,
    type: mappedType,
    title: null,
    content: row.content,
    image_path: row.image_path,
    source: LEGACY_SOURCE,
    source_url: null,
    metadata,
    is_private: 0,
    created_at: normalizeToUtcIso(row.created_at),
    // Raw entries never had an `updated_at` column in journal-shadows;
    // mirror `created_at` so the row passes the NOT NULL check.
    updated_at: normalizeToUtcIso(row.created_at),
  };
}

/**
 * Map a legacy `note_names` row to a ShadowBrain `content_items` row
 * with `type='note'`.
 *
 * The legacy `note_names` table only stored a display name + path —
 * the body content lived in a separate markdown file. We don't have
 * the file content here (the migration script reads the markdown
 * separately), so `content` defaults to an empty string and the
 * caller is expected to `UPDATE` the row with the file body. We
 * keep the path in `metadata.path` so the file-lookup is recoverable.
 *
 * The id is a stable hash of `path` (same scheme as the markdown
 * importer) so re-running the import on the same tree is idempotent.
 */
export function mapNoteName(row: LegacyNoteName): MappedContentItem {
  return {
    id: noteIdForPath(row.path),
    type: "note",
    title: row.display_name,
    content: "",
    image_path: null,
    source: LEGACY_SOURCE,
    source_url: null,
    metadata: JSON.stringify({ path: row.path }),
    is_private: 0,
    created_at: normalizeToUtcIso(row.created_at),
    updated_at: normalizeToUtcIso(row.updated_at),
  };
}

/**
 * Produce a stable, deterministic id for a `note_names.path`.
 * Same scheme as the markdown importer's `generateStableId` so a
 * `note_names` row and the matching `.md` file get the same id
 * (the markdown importer and this migrator would otherwise disagree).
 */
export function noteIdForPath(path: string): string {
  const hash = createHash("sha256").update(path).digest("hex");
  return `note-md-${hash.slice(0, 32)}`;
}

/**
 * Normalize a legacy journal-shadows timestamp to UTC ISO 8601 with
 * a trailing `Z`. The legacy app wrote DATETIME values inconsistently
 * — some with a `Z` suffix and some without, but in all observed
 * snapshots the values were *intended* to be UTC. Parsing without
 * a TZ indicator as the host's local time (Node's default for
 * `new Date(string)`) silently miscounts rows in the
 * `[period_start, period_end]` window when the container runs in
 * any non-UTC timezone.
 *
 * - If the string already carries a TZ marker (`Z`, `+HH:MM`, etc.)
 *   it is parsed and re-emitted as-is (via `toISOString`).
 * - If the string has no TZ marker, `Z` is appended so the parser
 *   treats it as UTC.
 * - If the string is unparseable, it is returned verbatim so the
 *   row still migrates (subsequent comparisons will simply not
 *   match — which is the correct, safe behaviour for garbage data).
 *
 * Exposed for testing.
 */
export function normalizeToUtcIso(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  // Trailing `Z` or `±HH:MM` (or `±HHMM`) TZ marker.
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(value);
  const d = new Date(hasTz ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toISOString();
}

/**
 * Build the `journal_periods` row for a given journal entry, counting
 * the raw entries whose `created_at` falls inside the period
 * (inclusive on both ends). `model_used` is not stored in the legacy
 * schema, so it stays `null`.
 */
export function mapJournalPeriod(
  journalId: string,
  periodStart: string,
  periodEnd: string,
  rawEntries: ReadonlyArray<LegacyRawEntry>
): MappedJournalPeriod {
  // Normalise both ends AND every raw's `created_at` to UTC ISO so
  // the comparison is timezone-independent. The legacy app wrote
  // these as UTC (sometimes with a `Z`, sometimes without), and
  // passing them to `Date.parse` directly makes Node interpret
  // no-TZ strings as local time — which silently miscounts raws
  // in any non-UTC container.
  const start = Date.parse(normalizeToUtcIso(periodStart));
  const end = Date.parse(normalizeToUtcIso(periodEnd));
  const raw_count = rawEntries.filter((r) => {
    const t = Date.parse(normalizeToUtcIso(r.created_at));
    if (Number.isNaN(t)) return false;
    return t >= start && t <= end;
  }).length;

  return {
    content_id: journalId,
    period_start: normalizeToUtcIso(periodStart),
    period_end: normalizeToUtcIso(periodEnd),
    raw_count,
    model_used: null,
  };
}

/**
 * Filter legacy settings for safe import.
 *
 * - Drops every key in {@link SETTINGS_BLOCKLIST} (secrets, stale
 *   URLs, etc.).
 * - Returns the rest verbatim.
 *
 * This is intentionally a pure function returning a new array, not an
 * in-place filter, so the caller can log the dropped keys before they
 * are discarded.
 */
export function mapSettings(rows: ReadonlyArray<LegacySetting>): {
  kept: MappedSetting[];
  dropped: Array<{ key: string; reason: string }>;
} {
  const kept: MappedSetting[] = [];
  const dropped: Array<{ key: string; reason: string }> = [];

  for (const row of rows) {
    if (SETTINGS_BLOCKLIST.has(row.key)) {
      dropped.push({
        key: row.key,
        reason: "Secrets and stale URLs are not migrated.",
      });
      continue;
    }
    kept.push({ key: row.key, value: row.value });
  }

  return { kept, dropped };
}
