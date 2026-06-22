# Tags

CRUD for tags. Tags are case-insensitive (COLLATE NOCASE) but preserve
the user's input casing.

---

## GET /api/tags

List all tags with usage counts.

### Request

```http
GET /api/tags
Cookie: sb_session=...
```

### Response (200)

```json
{
  "tags": [
    {
      "id": "uuid",
      "name": "devops",
      "created_at": "2026-06-01T10:00:00.000Z",
      "count": 12
    }
  ],
  "total": 8
}
```

### Errors

| Status | Code         | Message           |
| ------ | ------------ | ----------------- |
| 401    | UNAUTHORIZED | Not authenticated |

---

## POST /api/tags

Create a new tag.

### Request

```http
POST /api/tags
Content-Type: application/json
Cookie: sb_session=...
Origin: http://localhost:3000
```

```json
{
  "name": "new-tag"
}
```

### Validation

- Length: 1–64 characters
- Allowed: ASCII letters, digits, spaces, hyphens, underscores
- Pattern: `^[a-zA-Z0-9 _-]+$`

### Response (201)

```json
{
  "id": "uuid",
  "name": "new-tag",
  "created_at": "2026-06-22T10:30:00.000Z"
}
```

### Errors

| Status | Code             | Message                                    |
| ------ | ---------------- | ------------------------------------------ |
| 400    | VALIDATION_ERROR | Invalid name                               |
| 401    | UNAUTHORIZED     | Not authenticated                          |
| 409    | CONFLICT         | Tag name already exists (case-insensitive) |

---

## PATCH /api/tags/{id}

Rename a tag.

### Request

```http
PATCH /api/tags/uuid
Content-Type: application/json
Cookie: sb_session=...
Origin: http://localhost:3000
```

```json
{
  "name": "renamed-tag"
}
```

### Validation

Same as create. Case-only changes (e.g., "alpha" → "ALPHA") are allowed
as meaningful renames. A conflict with another tag (case-insensitive)
returns 409.

### Response (200)

```json
{
  "id": "uuid",
  "name": "renamed-tag",
  "created_at": "2026-06-01T10:00:00.000Z"
}
```

### Errors

| Status | Code             | Message                 |
| ------ | ---------------- | ----------------------- |
| 400    | VALIDATION_ERROR | Invalid name            |
| 401    | UNAUTHORIZED     | Not authenticated       |
| 404    | NOT_FOUND        | Tag not found           |
| 409    | CONFLICT         | Tag name already exists |

---

## DELETE /api/tags/{id}

Delete a tag.

### Request

```http
DELETE /api/tags/uuid
Cookie: sb_session=...
```

### Cascade

Associated `content_tags` rows are removed via `ON DELETE CASCADE`.

### Response (200)

```json
{ "id": "uuid" }
```

### Errors

| Status | Code         | Message           |
| ------ | ------------ | ----------------- |
| 401    | UNAUTHORIZED | Not authenticated |
| 404    | NOT_FOUND    | Tag not found     |
