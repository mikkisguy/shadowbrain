# Search

Full-text search using SQLite FTS5 with BM25 ranking and snippet highlighting.

---

## GET /api/search

Execute a full-text search query.

### Query Parameters

| Parameter         | Type    | Required | Description                           |
| ----------------- | ------- | -------- | ------------------------------------- |
| `q`               | string  | Yes      | Search query (1–256 chars)            |
| `type`            | string  | No       | Filter by content type                |
| `tag`             | string  | No       | Filter by tag name (case-insensitive) |
| `page`            | integer | No (1)   | Page number (≥ 1)                     |
| `limit`           | integer | No (20)  | Results per page (1–100)              |
| `include_hidden`  | string  | No       | `"1"` to include hidden               |
| `include_private` | string  | No       | `"1"` to include private              |

### Request

```http
GET /api/search?q=docker+networking&type=note&tag=devops&page=1&limit=20
Cookie: sb_session=...
```

### Response (200)

```json
{
  "query": "docker networking",
  "results": [
    {
      "id": "uuid",
      "type": "note",
      "title": "Docker Networking",
      "content": "## Overview\nBridge networks...",
      "source": "manual",
      "source_url": null,
      "is_private": 0,
      "is_hidden": 0,
      "created_at": "2026-06-22T10:30:00.000Z",
      "updated_at": "2026-06-22T10:30:00.000Z",
      "rank": 0.123,
      "snippet": "...Bridge <mark>networks</mark> are the default..."
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

### FTS5 Query Syntax

- Terms are quoted and escaped automatically.
- Prefix search: `hello*` matches "hello", "helloworld".
- Multiple terms: `docker networking` matches both terms (AND).
- Quoted phrases: the sanitizer wraps each term in quotes.

### Errors

| Status | Code             | Message                 |
| ------ | ---------------- | ----------------------- |
| 400    | VALIDATION_ERROR | Query empty or too long |
| 401    | UNAUTHORIZED     | Not authenticated       |

---

## Semantic / Vector Search

Semantic search is not exposed via a REST endpoint. It is available via the
internal `vectorSearch(db, queryEmbedding, options)` function in
`src/db/vectors.ts`. The embedding must be generated externally (e.g., by
a local sentence-transformers model). See [AI Processing](ai-processing.md).
