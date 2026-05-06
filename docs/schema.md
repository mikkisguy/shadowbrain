# Database Schema

## Design Philosophy

One database, every thought type. SQLite with extensions for full-text and semantic search. The schema is designed for **decades** — no trendy ORM abstractions, no cloud dependencies. Plain SQL you can run anywhere.

---

## Core Tables

### `content_items` — The Universal Table

Every piece of content — regardless of type — lives here.

```sql
CREATE TABLE content_items (
    id          TEXT PRIMARY KEY,              -- UUID v4
    type        TEXT NOT NULL,                 -- See Content Types below
    title       TEXT,                          -- Optional title (notes, bookmarks, journal entries)
    content     TEXT NOT NULL,                 -- Full text body (Markdown)
    image_path  TEXT,                          -- Relative to data/images/ (e.g. '2026-05/uuid.webp')
    source      TEXT NOT NULL DEFAULT 'manual',-- 'discord', 'web', 'api', 'import', 'hermes'
    source_url  TEXT,                          -- Original URL (bookmarks, imported content)
    metadata    TEXT,                          -- JSON blob for type-specific fields
    is_private  INTEGER NOT NULL DEFAULT 0,    -- 1 = never surfaced in AI queries
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL
);

CREATE INDEX idx_content_type ON content_items(type);
CREATE INDEX idx_content_source ON content_items(source);
CREATE INDEX idx_content_created ON content_items(created_at);
CREATE INDEX idx_content_updated ON content_items(updated_at);
```

### Content Types (`type` column)

| Type | Description | Example | Metadata JSON (optional) |
|------|-------------|---------|--------------------------|
| `raw` | Quick capture, fleeting thought | "Need to fix the nginx timeout setting" | `null` |
| `journal` | AI-compiled daily summary | "You reflected on deployment automation..." | `null` |
| `note` | Permanent knowledge note | "Docker Networking Deep Dive" | `null` |
| `bookmark` | Saved URL + notes | Article about Postgres indexing | `{"url":"https://...", "favicon":null, "read":false}` |
| `person` | Someone you interact with | "Sarah (DevOps lead)" | `{"email":"...", "github":"...", "role":"..."}` |
| `project` | A project or initiative | "BranchForge" | `{"status":"active", "repo":"https://...", "started":"2026-01"}` |
| `question` | A question you're exploring | "Should we use Kafka or NATS?" | `{"status":"open", "answered_by":null}` |
| `event` | A timestamped occurrence | "Deployed v2.3 to production" | `{"event_date":"2026-04-12", "duration":null}` |
| `dream` | Dream journal entry | "I was flying over a city made of..." | `{"mood":"surreal", "lucidity":3}` |

### Why a single table?

- **One query** across all content: `SELECT * FROM content_items WHERE content MATCH 'docker'`
- **Unified search**: semantic + full-text works on everything
- **Unified links**: any node can link to any other node
- **Simpler API**: one CRUD endpoint, filtered by type
- **Type-specific fields** go in `metadata` JSON to avoid schema bloat

---

## Links & Graph

### `content_links` — Typed, Bidirectional Connections

```sql
CREATE TABLE content_links (
    id          TEXT PRIMARY KEY,              -- UUID
    source_id   TEXT NOT NULL,                 -- From node
    target_id   TEXT NOT NULL,                 -- To node
    link_type   TEXT NOT NULL DEFAULT 'reference', -- See Link Types below
    context     TEXT,                          -- Surrounding text where link was made
    created_at  DATETIME NOT NULL,
    FOREIGN KEY (source_id) REFERENCES content_items(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES content_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_links_source ON content_links(source_id);
CREATE INDEX idx_links_target ON content_links(target_id);
CREATE INDEX idx_links_type ON content_links(link_type);
```

### Link Types

| Type | Meaning | Example |
|------|---------|---------|
| `reference` | General connection | Note → related note |
| `inspired_by` | This came from that | Note → bookmark that sparked it |
| `contradicts` | These disagree | Note A → Note B |
| `builds_upon` | Extends or refines | Note → earlier note |
| `involves` | Person/project participation | Project → Person |
| `bookmarked_for` | Saved for a project | Bookmark → Project |
| `answers` | Question resolved | Note → Question |
| `happened_during` | Event context | Event → Project |
| `is_prerequisite` | Must do before | Task → Task |

---

## Tags

```sql
CREATE TABLE tags (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color       TEXT,                          -- Optional hex color
    created_at  DATETIME NOT NULL
);

CREATE TABLE content_tags (
    content_id  TEXT NOT NULL,
    tag_id      TEXT NOT NULL,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (content_id, tag_id),
    FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_ct_content ON content_tags(content_id);
CREATE INDEX idx_ct_tag ON content_tags(tag_id);
```

---

## Vector Search (sqlite-vec)

```sql
-- Virtual table for embedding vectors
CREATE VIRTUAL TABLE content_vectors USING vec0(
    content_id  TEXT PRIMARY KEY,
    embedding   FLOAT[384]                    -- Dimension depends on embedding model
);

-- Matches: find semantically similar content
-- SELECT content_id, distance
-- FROM content_vectors
-- WHERE embedding MATCH ?
-- ORDER BY distance
-- LIMIT 10;
```

**Embedding model**: `all-MiniLM-L6-v2` (384 dimensions, lightweight) or configurable via OpenRouter for higher quality.

**When to embed**: On content creation/update. Initially batch-embed all existing content. Cron job for periodic re-embedding if model changes.

---

## Full-Text Search (FTS5)

```sql
CREATE VIRTUAL TABLE content_fts USING fts5(
    title,
    content,
    content=content_items,
    content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER content_ai AFTER INSERT ON content_items BEGIN
    INSERT INTO content_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER content_ad AFTER DELETE ON content_items BEGIN
    INSERT INTO content_fts(content_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER content_au AFTER UPDATE ON content_items BEGIN
    INSERT INTO content_fts(content_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
    INSERT INTO content_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
```

---

## Journal-Specific

### `journal_periods` — 4 AM Boundary Data

```sql
CREATE TABLE journal_periods (
    content_id   TEXT PRIMARY KEY,            -- References content_items (type='journal')
    period_start DATETIME NOT NULL,           -- Start of compilation window
    period_end   DATETIME NOT NULL,           -- End of compilation window
    raw_count    INTEGER NOT NULL,            -- How many raw entries fed this journal
    model_used   TEXT,                        -- AI model that generated it
    FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE
);
```

---

## Settings

```sql
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default settings
INSERT INTO settings VALUES ('ai_provider', 'openrouter');
INSERT INTO settings VALUES ('ai_model', 'mistralai/mistral-7b-instruct');
INSERT INTO settings VALUES ('embedding_model', 'all-MiniLM-L6-v2');
INSERT INTO settings VALUES ('version', '1.0.0');
```

---

## Migration from journal-shadows

The old schema (`raw_entries`, `journal_entries`, `note_names`) maps cleanly:

```sql
-- Old raw_entries → content_items (type='raw')
INSERT INTO content_items (id, type, title, content, image_path, source, created_at, updated_at)
SELECT id, 'raw', NULL, content, image_path, 'discord', created_at, created_at
FROM raw_entries;

-- Old journal_entries → content_items (type='journal') + journal_periods
INSERT INTO content_items (id, type, title, content, source, created_at, updated_at)
SELECT id, 'journal', COALESCE(title, date), content, 'ai', created_at, COALESCE(updated_at, created_at)
FROM journal_entries;

INSERT INTO journal_periods (content_id, period_start, period_end, raw_count)
SELECT id, period_start, period_end, 0
FROM journal_entries
WHERE period_start IS NOT NULL;

-- Old note_names → metadata for markdown imports
-- (actual note content imported from markdown/files)
```

---

## Query Examples

**"Everything about Docker across all content types"**
```sql
SELECT * FROM content_items
WHERE content_fts MATCH 'docker'
ORDER BY created_at DESC;
```

**"Find notes semantically similar to this one"**
```sql
SELECT ci.*, cv.distance
FROM content_vectors cv
JOIN content_items ci ON ci.id = cv.content_id
WHERE cv.embedding MATCH (SELECT embedding FROM content_vectors WHERE content_id = ?)
  AND cv.content_id != ?
ORDER BY cv.distance
LIMIT 10;
```

**"What projects is this bookmark connected to?"**
```sql
SELECT ci.* FROM content_items ci
JOIN content_links cl ON cl.target_id = ci.id
WHERE cl.source_id = ? AND ci.type = 'project' AND cl.link_type = 'bookmarked_for';
```

**"Orphan detection — notes with zero connections"**
```sql
SELECT * FROM content_items
WHERE type IN ('note', 'bookmark')
AND id NOT IN (SELECT source_id FROM content_links)
AND id NOT IN (SELECT target_id FROM content_links)
ORDER BY created_at DESC;
```

**"Most used tags"**
```sql
SELECT t.name, COUNT(*) as cnt
FROM tags t
JOIN content_tags ct ON ct.tag_id = t.id
GROUP BY t.name
ORDER BY cnt DESC
LIMIT 20;
```
