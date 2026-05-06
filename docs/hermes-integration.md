     1|# Hermes Integration
     2|
     3|Hermes is the **primary interface** to ShadowBrain. The web UI is the backup. This document defines how Hermes interacts with the system.
     4|
     5|---
     6|
     7|## Relationship Model
     8|
     9|```
    10|User ←→ Hermes ←→ ShadowBrain (SQLite)
    11|         ↑
    12|    User ←→ Web UI ←→ ShadowBrain (same SQLite)
    13|```
    14|
    15|Hermes talks directly to the SQLite database (read queries) and to the Next.js API (write operations with validation). Both the WebSocket listener and Hermes write concurrently — WAL mode handles this safely.
    16|
    17|---
    18|
    19|## Tools Hermes Uses
    20|
    21|### Direct DB Access (read-only)
    22|
    23|```python
    24|import sqlite3
    25|DB = "$DATA_DIR/journal.db"
    26|
    27|def query_db(sql, params=()):
    28|    conn = sqlite3.connect(DB)
    29|    conn.row_factory = sqlite3.Row
    30|    rows = conn.execute(sql, params).fetchall()
    31|    conn.close()
    32|    return [dict(r) for r in rows]
    33|```
    34|
    35|**When**: Searching, browsing, context building. Reads are fast and don't lock.
    36|
    37|### API Calls (writes)
    38|
    39|```python
    40|# Create content via API so validation and triggers run
    41|POST /api/items
    42|{
    43|    "type": "raw",
    44|    "content": "Need to fix the rate limiting...",
    45|    "source": "hermes"
    46|}
    47|```
    48|
    49|**When**: Creating, updating, deleting content. The API runs validation, FTS triggers, vector embedding, and link parsing.
    50|
    51|---
    52|
    53|## Core Capabilities
    54|
    55|### 1. Capture on Behalf of User
    56|
    57|```
    58|User: "save this: the new nginx config needs a reload after cert renewal"
    59|Hermes: POST /api/items { type: "raw", content: "...", source: "hermes" }
    60|Hermes: "Saved. It'll be compiled in tonight's journal."
    61|```
    62|
    63|Auto-detect type:
    64|- Contains URL → suggest `bookmark`
    65|- Contains "TODO" or "need to" → tag as `action-item`
    66|- User explicitly says "note about X" → `note`
    67|
    68|### 2. Query Journal Entries
    69|
    70|```sql
    71|-- Today's entry (4am boundary)
    72|SELECT * FROM content_items
    73|WHERE type = 'journal'
    74|AND date(created_at, '-4 hours') = date('now', '-4 hours')
    75|ORDER BY created_at DESC LIMIT 1;
    76|
    77|-- By date range
    78|SELECT * FROM content_items
    79|WHERE type = 'journal'
    80|AND created_at >= ? AND created_at <= ?
    81|ORDER BY created_at DESC;
    82|
    83|-- Last N entries
    84|SELECT * FROM content_items
    85|WHERE type = 'journal'
    86|ORDER BY created_at DESC LIMIT ?;
    87|```
    88|
    89|### 3. Cross-Content Search
    90|
    91|```sql
    92|-- Full-text search across everything
    93|SELECT * FROM content_items
    94|WHERE content_fts MATCH ?
    95|ORDER BY rank;
    96|
    97|-- Hybrid: FTS + tag filter + type filter
    98|SELECT ci.* FROM content_items ci
    99|JOIN content_tags ct ON ct.content_id = ci.id
   100|JOIN tags t ON t.id = ct.tag_id
   101|WHERE ci.content_fts MATCH ?
   102|AND ci.type = ?
   103|AND t.name = ?
   104|ORDER BY ci.created_at DESC;
   105|```
   106|
   107|### 4. Semantic Search
   108|
   109|```sql
   110|-- Find similar content
   111|SELECT ci.*, distance
   112|FROM content_vectors cv
   113|JOIN content_items ci ON ci.id = cv.content_id
   114|WHERE cv.embedding MATCH ?
   115|AND cv.content_id != ?
   116|ORDER BY distance
   117|LIMIT 10;
   118|```
   119|
   120|Embedding generation happens at the API level (when content is created). Hermes only queries existing vectors.
   121|
   122|### 5. Graph Traversal
   123|
   124|```sql
   125|-- One hop: everything linked to this item
   126|SELECT ci.*, cl.link_type, cl.context
   127|FROM content_items ci
   128|JOIN content_links cl ON (cl.target_id = ci.id OR cl.source_id = ci.id)
   129|WHERE (cl.source_id = ? OR cl.target_id = ?)
   130|AND ci.id != ?;
   131|
   132|-- Backlinks: who links to this item
   133|SELECT ci.*, cl.link_type
   134|FROM content_items ci
   135|JOIN content_links cl ON cl.source_id = ci.id
   136|WHERE cl.target_id = ?;
   137|```
   138|
   139|### 6. Context Building
   140|
   141|When the user asks a question, Hermes should:
   142|
   143|1. **Search FTS** for keyword matches in content
   144|2. **Search tags** for matching topics
   145|3. **Recent journal entries** for temporal context
   146|4. **Combine and rank** results
   147|5. **Present** with source references
   148|
   149|```python
   150|def build_context(topic: str, days: int = 30) -> list[dict]:
   151|    """Build rich context from all content types."""
   152|    results = []
   153|
   154|    # FTS search
   155|    results += query_db(
   156|        "SELECT *, rank FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 5",
   157|        (topic,)
   158|    )
   159|
   160|    # Recent journal entries
   161|    results += query_db(
   162|        "SELECT * FROM content_items WHERE type='journal' AND created_at >= date('now', ?) ORDER BY created_at DESC",
   163|        (f'-{days} days',)
   164|    )
   165|
   166|    # Deduplicate and sort by relevance
   167|    seen = set()
   168|    unique = []
   169|    for r in results:
   170|        if r['id'] not in seen:
   171|            seen.add(r['id'])
   172|            unique.append(r)
   173|
   174|    return unique[:10]
   175|```
   176|
   177|---
   178|
   179|## Response Patterns
   180|
   181|### Answering "what was I working on?"
   182|```
   183|1. Query journal entries from the date range
   184|2. Extract key themes/projects from content
   185|3. List with timestamps
   186|4. Offer to show connected notes
   187|```
   188|
   189|### Answering "find notes about X"
   190|```
   191|1. FTS search for keyword
   192|2. Semantic search for similar concepts
   193|3. Merge results, show top 5-10
   194|4. Show tags and links for each result
   195|5. Offer to dig deeper into any result
   196|```
   197|
   198|### Capturing a thought
   199|```
   200|1. Detect type (raw, bookmark, note)
   201|2. Save via API
   202|3. Confirm with: type, preview, when it'll be compiled
   203|4. Suggest tags if applicable
   204|```
   205|
   206|---
   207|
   208|## Privacy Rules
   209|
   210|- **Never surface** content where `is_private = 1` unless user explicitly asks
   211|- **Don't read settings** unless user asks to configure AI providers
   212|- **Write operations** always go through API for validation — never raw SQL INSERT
   213|- **Backups** are the user's responsibility; Hermes can remind but won't execute db dumps
   214|