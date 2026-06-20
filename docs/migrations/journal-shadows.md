# Migration: journal-shadows → ShadowBrain

This document records the one-time data migration that brought content
from the legacy `journal-shadows` SQLite database into the ShadowBrain
schema. The migration was driven by issue #19.

## TL;DR

```bash
# Default source: $JOURNAL_SHADOWS_DB or ../journal-shadows/data/journal.db
pnpm migrate:journal-shadows

# Explicit source + on-import validation:
pnpm migrate:journal-shadows --source /path/to/journal.db --validate

# Read-only sanity check (no DB writes):
pnpm migrate:journal-shadows --dry-run
```

The script is **idempotent** — every row is inserted with
`INSERT OR IGNORE` keyed on the source id, so a re-run on the same
source is a no-op. An optional `--validate` pass re-counts and asserts
the destination is consistent (no orphans, no missing rows).

## Source → destination mapping

The legacy schema (May 2026 snapshot) had four tables of interest:

| Legacy table      | What's in it                        | What becomes                                               |
| ----------------- | ----------------------------------- | ---------------------------------------------------------- |
| `journal_entries` | Daily compiled summaries            | `content_items` (`type='journal'`) + `journal_periods` row |
| `raw_entries`     | Per-message text + image captures   | `content_items` (`type='raw_text'` or `'image'`)           |
| `note_names`      | Display name + path for `.md` notes | `content_items` (`type='note'`)                            |
| `settings`        | Mixed (incl. secrets)               | `settings` (secrets + stale URLs dropped)                  |

`users` and `sessions` are deliberately **not** migrated — the new
app uses a different auth model and copying session tokens would be
actively unsafe.

### `journal_entries` → `content_items` + `journal_periods`

| Source column  | Destination column                   | Notes                                                                           |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `id`           | `content_items.id`                   | Preserved verbatim                                                              |
| `date`         | `content_items.metadata.legacy_date` | JSON-encoded so the day survives                                                |
| `content`      | `content_items.content`              | Verbatim                                                                        |
| `title`        | `content_items.title`                | `NULL` if the source had none                                                   |
| `created_at`   | `content_items.created_at`           | Verbatim                                                                        |
| `updated_at`   | `content_items.updated_at`           | Verbatim                                                                        |
| `period_start` | `journal_periods.period_start`       | On a sibling `journal_periods` row                                              |
| `period_end`   | `journal_periods.period_end`         | On a sibling `journal_periods` row                                              |
| (computed)     | `journal_periods.raw_count`          | Count of `raw_entries` whose `created_at` falls in `[period_start, period_end]` |
| (n/a)          | `journal_periods.model_used`         | Always `NULL` — legacy schema didn't track this                                 |
| (constant)     | `content_items.type`                 | `'journal'`                                                                     |
| (constant)     | `content_items.source`               | `'journal-shadows'`                                                             |
| (constant)     | `content_items.is_private`           | `0` — legacy journal entries are public                                         |

### `raw_entries` → `content_items`

| Source column  | Destination column              | Notes                                                 |
| -------------- | ------------------------------- | ----------------------------------------------------- |
| `id`           | `content_items.id`              | Preserved verbatim                                    |
| `content`      | `content_items.content`         | Verbatim                                              |
| `type='text'`  | `content_items.type='raw_text'` |                                                       |
| `type='image'` | `content_items.type='image'`    |                                                       |
| `image_path`   | `content_items.image_path`      | Verbatim (relative to the legacy `data/images/` tree) |
| `created_at`   | `content_items.created_at`      | Verbatim                                              |
| (no source)    | `content_items.updated_at`      | Mirrors `created_at` (legacy had no `updated_at`)     |
| unknown `type` | `content_items.type='raw_text'` | Original recorded in `metadata.legacy_type`           |

### `note_names` → `content_items`

The legacy `note_names` table only stored a display name + path; the
body of each note lived in a separate `.md` file. The migrator:

1. Inserts a `content_items` row (`type='note'`) with `title=display_name`
   and an empty `content`.
2. Stores the path in `metadata.path` so the file lookup is recoverable.
3. The `note-md-<32 hex chars>` id is derived from the path with
   SHA-256, matching the [markdown importer's](../lib/markdown-importer.ts)
   `generateStableId` so a re-run of `pnpm import:markdown` on the
   same tree collides on the same id and overwrites the empty content
   with the file body.

If you have `.md` files for the `note_names` paths, run the markdown
importer **after** the migration to backfill the bodies.

### `settings` → `settings` (blocklist applied)

| Key                              | Migrated? | Reason                                         |
| -------------------------------- | --------- | ---------------------------------------------- |
| `ai_provider`                    | yes       | Still relevant                                 |
| `ai_model`                       | yes       | Still relevant — newer qwen3 model             |
| `hermes_discord_last_message_id` | yes       | Diagnostic, harmless                           |
| `ollama_url`                     | **no**    | Stale — new app talks to OpenRouter by default |
| `openrouter_api_key`             | **no**    | Secret — must be re-entered in `.env`          |
| `groq_api_key`                   | **no**    | Secret — must be re-entered in `.env`          |
| `password_hash`                  | **no**    | Different auth model; never copy across        |

The blocklist lives in `src/lib/journal-shadows-migrator.ts` as
`SETTINGS_BLOCKLIST` so it's easy to extend.

## How the script is structured

```
src/lib/journal-shadows-migrator.ts      ← pure mapping functions (unit-tested)
scripts/migrate-journal-shadows.ts       ← CLI: open legacy DB read-only, run, validate
```

The library has zero `better-sqlite3` coupling — every mapper takes
plain objects and returns plain objects. This makes the mapping
fully testable without spinning up a DB:

```
src/lib/__tests__/journal-shadows-migrator.test.ts
```

The CLI script owns:

- Discovering / opening the legacy DB in `mode=ro` so it can't
  interfere with the live legacy file (which may be in WAL mode).
- Reading source rows in one pass and handing them to the mappers.
- A single `db.transaction` so a mid-run crash rolls the whole
  import back.
- An `audit_logs` entry per run (not per row, to keep the table
  readable) tagged `action='migration.run'`.
- A `--validate` flag that re-counts and asserts there are no
  orphan `journal_periods` and every `type='journal'` row has a
  matching `journal_periods` row.

## Acceptance criteria

From issue #19:

- [x] Reads from old journal-shadows SQLite DB
- [x] Maps old schema to new ShadowBrain schema
- [x] Preserves original IDs (journal entries + raw entries) where possible
- [x] Migrates all content items (over 100 entries; the May 2026
      snapshot has 23 journal + 111 raw = 134 content items, plus
      3 note-name rows)
- [x] Migrates tags and relationships — _no tags existed in the
      legacy schema, so this is N/A; the journal↔raw relationship is
      encoded as `journal_periods.raw_count` rather than a join
      table_ (see "Trade-offs" below)
- [x] Runs via direct DB (for speed) — opens the legacy DB in
      read-only mode, streams all rows into a single transaction;
      no API round-trip overhead
- [x] Validates migration (count matches, no orphans) — `--validate`
      runs the post-import check
- [x] Documented in migration notes (this file)

## Trade-offs

- **No per-raw → journal link table.** The legacy schema had no
  explicit `journal_entry_id` on `raw_entries` — the relationship was
  implied by the `[period_start, period_end]` window. The new schema
  does the same: `journal_periods` carries `period_start` /
  `period_end`, and the client computes which raws fall inside the
  window. We **also** persist `raw_count` so the historical number
  is captured without needing a join at render time.

- **No settings secrets are migrated.** The `openrouter_api_key`
  in the legacy DB is in plaintext (the legacy app stored it that
  way); we drop it. Re-enter your API key in `.env` after the
  migration completes.

- **Idempotency over partial updates.** Re-runs are full
  `INSERT OR IGNORE` passes; we never overwrite an already-migrated
  row. If you want to re-import a row that was edited in ShadowBrain
  after the first migration, delete it from `content_items` first.

## Re-running / recovery

The script is safe to re-run after a partial failure (e.g. process
crash, OOM). The transaction guarantees atomicity, so a failed run
leaves the destination DB unchanged; the next run starts fresh.

If you want to "redo" the migration from scratch (e.g. the legacy
DB has been edited since the first run), delete the relevant rows
from the destination first:

```sql
DELETE FROM content_items WHERE source = 'journal-shadows';
DELETE FROM journal_periods;
DELETE FROM settings WHERE key NOT IN
  ('ai_provider', 'ai_model', 'embedding_model', 'version');
```

Then run `pnpm migrate:journal-shadows --validate`.
