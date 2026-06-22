# Links

Typed, bidirectional links between content items. Every link is stored
as two rows (forward + reverse) for efficient traversal in both
directions.

---

## Link Types

| Type              | Meaning                      | Example             |
| ----------------- | ---------------------------- | ------------------- |
| `references`      | General connection           | Note → related note |
| `contradicts`     | These disagree               | Note A → Note B     |
| `questions`       | This questions that          | Note → Question     |
| `answers`         | This answers that            | Note → Question     |
| `depends-on`      | Must do before               | Task → Task         |
| `related-to`      | General relation             | Note → Note         |
| `involves`        | Person/project participation | Project → Person    |
| `bookmarked_for`  | Saved for a project          | Bookmark → Project  |
| `happened_during` | Event context                | Event → Project     |

---

## POST /api/links

Create a bidirectional link.

### Request

```http
POST /api/links
Content-Type: application/json
Cookie: sb_session=...
Origin: http://localhost:3000
```

```json
{
  "source_id": "uuid",
  "target_id": "uuid",
  "link_type": "references",
  "context": "This note was inspired by that bookmark"
}
```

### Validation

- `source_id` ≠ `target_id` (no self-links)
- Both IDs must reference existing content items
- Visibility opt-in is forced on internally (admins can link hidden/private items)

### Duplicate Detection

Links are treated as undirected for uniqueness: a link between A and B
of type T blocks creating B→T→A of the same type. The check and insert
run in a single transaction to prevent TOCTOU races.

### Response (201)

```json
{
  "id": "forward-uuid",
  "source_id": "uuid",
  "target_id": "uuid",
  "link_type": "references",
  "context": "This note was inspired by that bookmark",
  "created_at": "2026-06-22T10:30:00.000Z"
}
```

### Errors

| Status | Code             | Message                                  |
| ------ | ---------------- | ---------------------------------------- |
| 400    | VALIDATION_ERROR | Invalid input / self-link / missing item |
| 401    | UNAUTHORIZED     | Not authenticated                        |
| 409    | CONFLICT         | Link already exists between these items  |

---

## Retrieving Links

Links are returned as part of `GET /api/items/{id}` in the `links` object:

```json
{
  "item": { ... },
  "tags": [...],
  "links": {
    "outbound": [
      { "id": "uuid", "source_id": "uuid", "target_id": "uuid", "link_type": "references", "context": "...", "created_at": "..." }
    ],
    "inbound": [
      { "id": "uuid", "source_id": "uuid", "target_id": "uuid", "link_type": "contradicts", "context": null, "created_at": "..." }
    ]
  }
}
```

There is no standalone GET /api/links endpoint — links are accessed
through their source/target items.
