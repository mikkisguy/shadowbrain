# Import and Export Guide

Import is an authenticated merge operation. Export files produced by
`GET /api/export?format=json` can be posted directly to the import endpoint.

## POST /api/import

Import JSON content with merge semantics.

```http
POST /api/import
Content-Type: application/json
Cookie: sb_session=...
```

The request body may be any of these forms:

1. A raw `shadowbrain-export` v1 envelope.
2. A legacy bare array of content items.
3. An object wrapper, `{ "mode": "merge", "data": ... }`, where `data` is
   either an envelope or a legacy array. `mode` may be omitted; `merge` is the
   only supported mode.

For the versioned envelope, the top-level fields are:

| Field             | Type          | Description                                             |
| ----------------- | ------------- | ------------------------------------------------------- |
| `format`          | string        | Must be `shadowbrain-export`.                           |
| `version`         | integer       | Must be `1`.                                            |
| `exported_at`     | ISO timestamp | Time the export was created.                            |
| `items`           | array         | Content items, including metadata and visibility flags. |
| `tags`            | array         | Tags available for assignment.                          |
| `item_tags`       | array         | Content-item/tag assignments.                           |
| `links`           | array         | Typed relationships between content items.              |
| `journal_periods` | array         | Journal aggregation period records; may be empty.       |

On a successful merge, imported items receive new UUIDs. Tags are matched by
name, and each link is restored bidirectionally after deduplication by the
unordered pair of endpoint IDs and `link_type`; reversing a link or submitting
the same direction twice does not create another relationship. Existing content
is not overwritten. Image binaries are excluded from the export and import:
`image_path` values are always discarded and stored as `null`, so no image file
is restored.

Import files are limited to 10 MiB (`10 * 1024 * 1024` bytes) for a single
`POST /api/import`. The settings UI rejects oversized files before reading them.
Each of `items`, `tags`, `links`, `item_tags`, and `journal_periods` is limited
to 50,000 records. Metadata may be nested (as used by content types such as
person social links), with runtime limits of 64 top-level properties, 8 nesting
depth, and 64 KiB JSON size. Validation returns at most 50 issues, and each
issue path/message is truncated to 200 characters.

`GET /api/export?format=json` always returns the dump for salvage. When the
serialized payload exceeds the single-POST restore ceiling, the response sets
`X-ShadowBrain-Importable: 0` and does **not** update `last_backup_at`. Importable
exports set `X-ShadowBrain-Importable: 1` and update the backup marker.

### Response (200)

The response reports created item, tag, link, and journal-period counts, plus
the number of tags reused by name.

### Validation and errors

Validation runs once before the merge transaction starts; an invalid request
does not write a partial import. Validation errors use
`error.details.issues`, with at most 50 issue strings returned:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid import data",
    "details": {
      "issues": ["items[0].content: ..."]
    }
  }
}
```

Legacy arrays must contain complete ContentItem-shaped objects (every exported
field present, including nullable keys and visibility flags). Non-object
elements or missing/wrong-typed required fields are rejected with zero writes.

| Status | Code                | Description                                                        |
| ------ | ------------------- | ------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`  | Invalid JSON, unsupported mode, or invalid import data/references. |
| 401    | `UNAUTHORIZED`      | Not authenticated.                                                 |
| 413    | `PAYLOAD_TOO_LARGE` | Request body exceeds the 10 MiB import ceiling.                    |
| 500    | `INTERNAL_ERROR`    | Import failed unexpectedly.                                        |

## GET /api/import/schema

Download the JSON Schema for the `shadowbrain-export` v1 envelope.

```http
GET /api/import/schema
Cookie: sb_session=...
```

The response is an attachment named `shadowbrain-export.schema.json` with
`Content-Type: application/schema+json`.

## GET /api/import/template

Download a minimal, valid import example containing a project, a related note,
one tag assignment, and one `related-to` link.

```http
GET /api/import/template
Cookie: sb_session=...
```

The response is an attachment named `shadowbrain-import-template.json` with
`Content-Type: application/json`. Both download endpoints require
authentication and return `401 Unauthorized` otherwise.
