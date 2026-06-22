# Database Guide

ShadowBrain uses SQLite with two extensions: **FTS5** (full-text search)
and **sqlite-vec** (vector / semantic search). This guide covers the
migration system, query helpers, connection management, seeding, and
backup.

For the full schema reference, see [schema.md](schema.md).

---

## Connection management

All database access goes through `getDb()` in
[`src/db/client.ts`](../src/db/client.ts). The connection is cached per
path + environment, so repeated calls return the same instance.

```ts
import { getDb } from "@/db/index";

const db = getDb(); // uses NODE_ENV to pick the file
```

### Per-environment databases

| Environment | File                           | When used             |
| ----------- | ------------------------------ | --------------------- |
| development | `shadowbrain.dev.db`           | `pnpm dev`            |
| test        | `shadowbrain.test.<worker>.db` | `pnpm test`           |
| production  | `shadowbrain.db`               | `NODE_ENV=production` |

The database file lives under `DATA_DIR` (default `./data`). The
directory is created automatically if missing.

### Connection settings

Every connection is opened with:

- **WAL mode** (`journal_mode = WAL`) — concurrent reads from the app,
  captures, and the AI processor don't block each other.
- **Foreign keys ON** — cascade deletes are enforced.

---

## sqlite-vec extension

Vector search requires the `vec0` shared library. On connection, the
client tries to load it from these paths:

- `dist/extensions/vec0.so` (development / production)
- `/app/dist/extensions/vec0.so` (Docker)

### Building locally

```bash
./scripts/build-sqlite-vec.sh
```

This compiles the C extension with AVX (x86_64) or NEON (ARM64)
optimization and places it at `dist/extensions/vec0.so`.

### Graceful degradation

If the extension is not loaded:

- The vector-search migration (0003) is **skipped** — the app starts
  without errors.
- FTS5 full-text search still works.
- `isVecExtensionLoaded(db)` returns `false`, so code can check before
  calling vector functions.

The Dockerfile builds the extension automatically during the image
build (see [Deployment](deployment.md)).

---

## Migrations

Migrations are plain SQL files in
[`src/db/migrations/`](../src/db/migrations/), numbered sequentially:

```
0001_initial_schema.sql
0002_fts_search.sql
0003_vector_search.sql
0004_audit_logs.sql
0005_is_hidden.sql
```

### How they run

Migrations run **automatically on first connection** — no manual step
needed. The runner (`src/db/migrations/migrate.ts`):

1. Creates a `schema_migrations` table tracking applied versions.
2. Reads the current max version.
3. Applies each pending migration in a **single transaction** (SQL +
   version insert are atomic).
4. Records the version + timestamp.

### Adding a migration

1. Create a new file: `src/db/migrations/0006_<description>.sql`
2. Write the SQL (idempotent where possible — use `CREATE TABLE IF NOT
EXISTS`).
3. The migration runs automatically on next startup.

> **Never edit an applied migration.** The migration history is an audit
> trail. If you need to change a table, add a new numbered migration
> instead. This is especially important under the App Security Baseline,
> where the migration log records every schema change.

### Skipping specific migrations

The runner accepts a `skipVersions` option. This is used internally to
skip the vector-search migration (0003) when the sqlite-vec extension is
not available:

```ts
runMigrations(db, { skipVersions: [VECTOR_SEARCH_MIGRATION_VERSION] });
```

### Manual setup

To create or reset a database for a specific environment:

```bash
pnpm setup           # development
pnpm setup:dev       # development (explicit)
pnpm setup:test      # test
pnpm setup:prod      # production
```

These run `scripts/setup-db.js`, which creates the database and applies
all migrations.

---

## Query helpers (repositories)

Database access is organized into repository objects in
[`src/db/repositories/`](../src/db/repositories/). All are re-exported
from [`src/db/index.ts`](../src/db/index.ts):

```ts
import {
  getDb,
  contentItems,
  contentLinks,
  contentTags,
  tags,
  auditLogs,
  settings,
  journalPeriods,
  search, // FTS5
  sanitizeFts5Query,
  vectorSearch, // sqlite-vec
  upsertEmbedding,
  getEmbedding,
  deleteEmbedding,
  isVecExtensionLoaded,
  getVectorCount,
} from "@/db/index";
```

### Example: create and retrieve a content item

```ts
const db = getDb();
const id = crypto.randomUUID();
const now = new Date().toISOString();

contentItems.create(db, {
  id,
  type: "note",
  title: "My Note",
  content: "Hello world",
  created_at: now,
  updated_at: now,
});

const item = contentItems.findById(db, id);
```

### Visibility-aware reads

Every read helper takes `includeHidden` / `includePrivate` options (both
default to `false`). Rows with a set flag are excluded unless the caller
opts in:

```ts
// Hidden and private items are excluded by default:
const visible = contentItems.findById(db, id);

// Admin can opt in (route layer gates this behind auth):
const everything = contentItems.findById(db, id, {
  includeHidden: true,
  includePrivate: true,
});
```

### Full-text search (FTS5)

```ts
const results = search.queryWithFilters(db, "docker networking", {
  type: "note", // optional filter
  tag: "devops", // optional filter
  limit: 20,
  offset: 0,
});
```

The `sanitizeFts5Query` helper escapes user input into safe FTS5 match
syntax (quoted terms, preserved prefix wildcards).

### Vector search (sqlite-vec)

```ts
// Store an embedding (384-dim float array for all-MiniLM-L6-v2):
upsertEmbedding(db, contentId, embeddingArray);

// Search by similarity:
const results = vectorSearch(db, queryEmbedding, { limit: 10, type: "note" });
```

See [AI Processing](ai-processing.md) for how embeddings are generated.

---

## Settings table

The `settings` table stores key-value configuration (AI keys, model
names, etc.). On first connection, `seedSettings(db)` syncs values from
environment variables into the table. This lets the settings page read
and update configuration without an app restart.

---

## Seeding test data

Test helpers in [`src/db/test-utils.ts`](../src/db/test-utils.ts)
provide everything needed for database tests:

```ts
import {
  createTestDb,
  resetTestDb,
  seedTestDb,
  cleanupTestDb,
  clearTable,
  getTableRowCount,
  assertTestDbEmpty,
} from "@/db/test-utils";
```

See [Testing](testing.md) for patterns.

---

## Backup and restore

### Backup

SQLite is a single file — backup is just a copy. Because WAL mode is
enabled, use one of these methods to get a consistent snapshot:

```bash
# Method 1: SQLite Online Backup API (recommended — consistent snapshot)
sqlite3 data/shadowbrain.db ".backup data/backup-$(date +%Y%m%d).db"

# Method 2: Use the .dump command for a SQL text export
sqlite3 data/shadowbrain.db ".dump" > backup.sql
```

> Never copy the `.db` file directly while the app is running — the WAL
> file (`-wal`) and shared-memory file (`-shm`) may contain uncommitted
> transactions. Use the `.backup` command or stop the app first.

### Restore

```bash
# Stop the app first
docker compose down

# Replace the database file
cp backup-20260622.db data/shadowbrain.db

# Restart
docker compose up -d
```

### Proton Drive backups

ShadowBrain includes an in-app backup reminder at `/backup` that walks
through setting up the Proton Drive CLI for automated E2E-encrypted
backups. See the [backup reminder spec](superpowers/specs/2026-06-19-backup-reminder-design.md).

---

## Importing data

### From Markdown

```bash
pnpm import:markdown
```

This reads Markdown files (with optional YAML frontmatter) and creates
`content_items`. See `scripts/import-markdown.ts`.

### From journal-shadows (legacy)

```bash
pnpm migrate:journal-shadows
```

Migrates content from a legacy journal-shadows database, including
sensitive settings (API keys are migrated securely). See
`scripts/migrate-journal-shadows.ts`.
