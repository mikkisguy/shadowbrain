# Hermes Integration

Hermes is the **primary interface** to ShadowBrain. The web UI is the backup. This document defines how Hermes interacts with the system.

---

## Relationship Model

```
User ←→ Hermes ←→ ShadowBrain (SQLite)
         ↑
    User ←→ Web UI ←→ ShadowBrain (same SQLite)
```

Hermes talks directly to the SQLite database (read queries) and to the Next.js API (write operations with validation). Both the WebSocket listener and Hermes write concurrently — WAL mode handles this safely.

---

## Tools Hermes Uses

### Direct DB Access (read-only)

```python
import sqlite3
DB = "$DATA_DIR/journal.db"

def query_db(sql, params=()):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]
```

**When**: Searching, browsing, context building. Reads are fast and don't lock.

### API Calls (writes)

```python
# Create content via API so validation and triggers run
POST /api/items
{
    "type": "raw",
    "content": "Need to fix the rate limiting...",
    "source": "hermes"
}
```

**When**: Creating, updating, deleting content. The API runs validation, FTS triggers, vector embedding, and link parsing.

---

## Core Capabilities

### 1. Capture on Behalf of User

```
User: "save this: the new nginx config needs a reload after cert renewal"
Hermes: POST /api/items { type: "raw", content: "...", source: "hermes" }
Hermes: "Saved. It'll be compiled in tonight's journal."
```

Auto-detect type:

- Contains URL → suggest `bookmark`
- Contains "TODO" or "need to" → tag as `action-item`
- User explicitly says "note about X" → `note`

### 2. Query Journal Entries

```sql
-- Today's entry (4am boundary)
SELECT * FROM content_items
WHERE type = 'journal'
AND date(created_at, '-4 hours') = date('now', '-4 hours')
ORDER BY created_at DESC LIMIT 1;

-- By date range
SELECT * FROM content_items
WHERE type = 'journal'
AND created_at >= ? AND created_at <= ?
ORDER BY created_at DESC;

-- Last N entries
SELECT * FROM content_items
WHERE type = 'journal'
ORDER BY created_at DESC LIMIT ?;
```

### 3. Cross-Content Search

```sql
-- Full-text search across everything
SELECT * FROM content_items
WHERE content_fts MATCH ?
ORDER BY rank;

-- Hybrid: FTS + tag filter + type filter
SELECT ci.* FROM content_items ci
JOIN content_tags ct ON ct.content_id = ci.id
JOIN tags t ON t.id = ct.tag_id
WHERE ci.content_fts MATCH ?
AND ci.type = ?
AND t.name = ?
ORDER BY ci.created_at DESC;
```

### 4. Semantic Search

```sql
-- Find similar content
SELECT ci.*, distance
FROM content_vectors cv
JOIN content_items ci ON ci.id = cv.content_id
WHERE cv.embedding MATCH ?
AND cv.content_id != ?
ORDER BY distance
LIMIT 10;
```

Embedding generation happens at the API level (when content is created). Hermes only queries existing vectors.

### 5. Graph Traversal

```sql
-- One hop: everything linked to this item
SELECT ci.*, cl.link_type, cl.context
FROM content_items ci
JOIN content_links cl ON (cl.target_id = ci.id OR cl.source_id = ci.id)
WHERE (cl.source_id = ? OR cl.target_id = ?)
AND ci.id != ?;

-- Backlinks: who links to this item
SELECT ci.*, cl.link_type
FROM content_items ci
JOIN content_links cl ON cl.source_id = ci.id
WHERE cl.target_id = ?;
```

### 6. Context Building

When the user asks a question, Hermes should:

1. **Search FTS** for keyword matches in content
2. **Search tags** for matching topics
3. **Recent journal entries** for temporal context
4. **Combine and rank** results
5. **Present** with source references

```python
def build_context(topic: str, days: int = 30) -> list[dict]:
    """Build rich context from all content types."""
    results = []

    # FTS search
    results += query_db(
        "SELECT *, rank FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 5",
        (topic,)
    )

    # Recent journal entries
    results += query_db(
        "SELECT * FROM content_items WHERE type='journal' AND created_at >= date('now', ?) ORDER BY created_at DESC",
        (f'-{days} days',)
    )

    # Deduplicate and sort by relevance
    seen = set()
    unique = []
    for r in results:
        if r['id'] not in seen:
            seen.add(r['id'])
            unique.append(r)

    return unique[:10]
```

---

## Response Patterns

### Answering "what was I working on?"

```
1. Query journal entries from the date range
2. Extract key themes/projects from content
3. List with timestamps
4. Offer to show connected notes
```

### Answering "find notes about X"

```
1. FTS search for keyword
2. Semantic search for similar concepts
3. Merge results, show top 5-10
4. Show tags and links for each result
5. Offer to dig deeper into any result
```

### Capturing a thought

```
1. Detect type (raw, bookmark, note)
2. Save via API
3. Confirm with: type, preview, when it'll be compiled
4. Suggest tags if applicable
```

---

## Privacy Rules

- **Never surface** content where `is_private = 1` unless user explicitly asks
- **Don't read settings** unless user asks to configure AI providers
- **Write operations** always go through API for validation — never raw SQL INSERT
- **Backups** are the user's responsibility; Hermes can remind but won't execute db dumps
