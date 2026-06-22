# Content Items

CRUD for the universal `content_items` table. Every thought type (raw, journal, note, bookmark, person, project, question, event, dream) lives here.

---

## Content Types

| Type       | Description                     | Metadata (optional)                                  |
| ---------- | ------------------------------- | ---------------------------------------------------- |
| `raw`      | Quick capture, fleeting thought | `null`                                               |
| `journal`  | AI-compiled daily summary       | `null`                                               |
| `note`     | Permanent knowledge note        | `null`                                               |
| `bookmark` | Saved URL + notes               | `{"url": "...", "favicon": null, "read": false}`     |
| `person`   | Someone you interact with       | `{"email": "...", "github": "...", "role": "..."}`   |
| `project`  | A project or initiative         | `{"status": "...", "repo": "...", "started": "..."}` |
| `question` | A question you're exploring     | `{"status": "open", "answered_by": null}`            |
| `event`    | A timestamped occurrence        | `{"event_date": "...", "duration": null}`            |
| `dream`    | Dream journal entry             | `{"mood": "...", "lucidity": 3}`                     |

> The API accepts any string for `type` — the list above are the
> conventional types. Metadata is validated per-type for the structured
> types (person, project, event, dream).

---

## Two-Level Visibility

| Flag         | Default views | AI / RAG behavior       |
| ------------ | ------------- | ----------------------- |
| `is_hidden`  | Excluded      | Allowed by default      |
| `is_private` | Excluded      | Only on explicit opt-in |

Authenticated requests can opt in:

- `?include_hidden=1`
- `?include_private=1`

Both require both flags to return an item with both set.

---

## GET /api/items

List content items (paginated, filterable).

### Query Parameters

| Parameter         | Type    | Default | Description                                                  |
| ----------------- | ------- | ------- | ------------------------------------------------------------ |
| `page`            | integer | 1       | Page number (≥ 1)                                            |
| `limit`           | integer | 20      | Items per page (1–100)                                       |
| `type`            | string  | —       | Filter by content type                                       |
| `tag`             | string  | —       | Filter by tag name (case-insensitive)                        |
| `source`          | string  | —       | Filter by source (manual, discord, web, api, import, hermes) |
| `startDate`       | string  | —       | `created_at` ≥ (ISO 8601)                                    |
| `endDate`         | string  | —       | `created_at` ≤ (ISO 8601)                                    |
| `include_hidden`  | string  | —       | Set to `"1"` to include hidden                               |
| `include_private` | string  | —       | Set to `"1"` to include private                              |

### Request

```http
GET /api/items?page=1&limit=20&type=note&tag=devops
Cookie: sb_session=...
```

### Response (200)

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "note",
      "title": "Docker Networking",
      "content": "## Overview\n...",
      "image_path": null,
      "source": "manual",
      "source_url": null,
      "metadata": null,
      "is_private": 0,
      "is_hidden": 0,
      "created_at": "2026-06-22T10:30:00.000Z",
      "updated_at": "2026-06-22T10:30:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

### Errors

| Status | Code         | Message           |
| ------ | ------------ | ----------------- |
| 401    | UNAUTHORIZED | Not authenticated |

---

## POST /api/items

Create a content item.

### Request

```http
POST /api/items
Content-Type: application/json
Cookie: sb_session=...
Origin: http://localhost:3000
```

```json
{
  "type": "note",
  "content": "## Docker Networking\n\nBridge vs overlay...",
  "title": "Docker Networking",
  "source": "manual",
  "source_url": null,
  "metadata": null,
  "is_private": 0,
  "is_hidden": 0
}
```

### Bookmark auto-fetch

If `type: "bookmark"`, the server extracts the first URL from `content`
and fetches OpenGraph metadata (title, description, favicon). This is
protected by the SSRF guard — private/internal IPs are blocked. The
bookmark is saved regardless; failed fetches record `auto_fetch` in
metadata.

### Response (201)

Returns the created item (with visibility opt-in forced so hidden/private
items are visible in the response).

```json
{
  "id": "uuid",
  "type": "note",
  "title": "Docker Networking",
  "content": "## Docker Networking\n\nBridge vs overlay...",
  "image_path": null,
  "source": "manual",
  "source_url": null,
  "metadata": null,
  "is_private": 0,
  "is_hidden": 0,
  "created_at": "2026-06-22T10:30:00.000Z",
  "updated_at": "2026-06-22T10:30:00.000Z"
}
```

### Errors

| Status | Code             | Message                             |
| ------ | ---------------- | ----------------------------------- |
| 400    | VALIDATION_ERROR | Invalid input (details in `issues`) |
| 401    | UNAUTHORIZED     | Not authenticated                   |

---

## GET /api/items/{id}

Get a single item with its tags and links.

### Query Parameters

| Parameter         | Type   | Description              |
| ----------------- | ------ | ------------------------ |
| `include_hidden`  | string | `"1"` to include hidden  |
| `include_private` | string | `"1"` to include private |

### Request

```http
GET /api/items/uuid?include_hidden=1
Cookie: sb_session=...
```

### Response (200)

```json
{
  "item": { ...ContentItem },
  "tags": [
    { "id": "uuid", "name": "devops", "created_at": "..." }
  ],
  "links": {
    "outbound": [
      { "id": "uuid", "source_id": "uuid", "target_id": "uuid", "link_type": "references", "context": "...", "created_at": "..." }
    ],
    "inbound": []
  }
}
```

### Errors

| Status | Code         | Message                                 |
| ------ | ------------ | --------------------------------------- |
| 401    | UNAUTHORIZED | Not authenticated                       |
| 404    | NOT_FOUND    | Item not found (or visibility excluded) |

---

## PATCH /api/items/{id}

Partial update of a content item.

### Query Parameters

| Parameter         | Type   | Description              |
| ----------------- | ------ | ------------------------ |
| `include_hidden`  | string | `"1"` to include hidden  |
| `include_private` | string | `"1"` to include private |

### Request

```http
PATCH /api/items/uuid
Content-Type: application/json
Cookie: sb_session=...
Origin: http://localhost:3000
```

```json
{
  "title": "Updated Title",
  "content": "Updated content",
  "metadata": { "custom": "value" },
  "is_hidden": 1
}
```

### Response (200)

Returns the updated item with relations (visibility forced on).

### Errors

| Status | Code             | Message                                 |
| ------ | ---------------- | --------------------------------------- |
| 400    | VALIDATION_ERROR | Invalid input                           |
| 401    | UNAUTHORIZED     | Not authenticated                       |
| 404    | NOT_FOUND        | Item not found (or visibility excluded) |

---

## DELETE /api/items/{id}

Delete a content item.

### Query Parameters

| Parameter         | Type   | Description              |
| ----------------- | ------ | ------------------------ |
| `include_hidden`  | string | `"1"` to include hidden  |
| `include_private` | string | `"1"` to include private |

### Request

```http
DELETE /api/items/uuid
Cookie: sb_session=...
```

### Response (200)

```json
{ "id": "uuid" }
```

### Cascade

- `content_links` (source + target): CASCADE
- `content_tags`: CASCADE
- `content_vectors`: Manual cleanup (virtual table, no FK)

### Errors

| Status | Code         | Message           |
| ------ | ------------ | ----------------- |
| 401    | UNAUTHORIZED | Not authenticated |
| 404    | NOT_FOUND    | Item not found    |
