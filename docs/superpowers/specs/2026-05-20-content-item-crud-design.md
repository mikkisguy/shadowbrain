# Content Item CRUD + Logging Design

## Goals

- Implement content item CRUD API endpoints with consistent validation and errors.
- Standardize structured JSON logging with redaction.
- Persist audit logs for key operations and security events.

## Non-Goals

- UI changes or admin dashboards.
- Authentication/authorization enforcement (TODO guard only).
- Semantic/vector search changes.

## Proposed Approach

Use shared request/response helpers and Zod schemas to keep the CRUD routes thin and consistent. Add a structured JSON logger wrapper for server diagnostics and a new `audit_logs` table for security/audit events.

Recommended approach: **Shared handler utilities + thin route files**.

## API Endpoints (Phase 1)

### POST /api/items

- Validate input with Zod.
- Generate `id` via `crypto.randomUUID()` and timestamps via `new Date().toISOString()`.
- Insert using `contentItems.create`.
- Return created item with `201`.
- If `type=bookmark` and `content` contains URL, fetch metadata and store in `metadata` (future task kept in scope).
- Log audit event: `content_item.create`.

### GET /api/items

- Parse filters: `type`, `tag`, `startDate`, `endDate`, `source`.
- Pagination defaults: `page=1`, `limit=20`, `max=100`.
- Return `{ items, total, page, limit }`.
- Log request timing (diagnostic logs only, no audit event).

### GET /api/items/[id]

- Fetch item by id, plus tags and links.
- Include outbound links (source -> target) and backlinks (target -> source).
- Return `404` if missing.

### PATCH /api/items/[id]

- Validate partial updates (content, metadata, is_private, title).
- Update `updated_at` and return updated item.
- Return `404` if missing.
- Log audit event: `content_item.update`.

### DELETE /api/items/[id]

- Run in a transaction.
- Delete item and cascade to links, tags, vectors.
- Return deleted ID.
- Log audit event: `content_item.delete`.

## Error Handling

- Standard error shape: `{ error: { code, message, details? } }`.
- `400` for validation errors (safe details only).
- `404` for missing records.
- `500` for unexpected errors with generic message; full error in server logs.
- No secrets or sensitive content in responses.

## Logging

### Structured JSON Logs

- Emit JSON logs with stable fields: `level`, `msg`, `event`, `requestId`, `route`, `status`, `durationMs`, `userId?`, `ip?`.
- Redact: auth headers, cookies, API keys, sensitive request bodies.
- Include error stack only in logs, never in responses.

### Audit Logs (Database)

- New table `audit_logs`:
  - `id`, `actor_id?`, `actor_type?`, `action`, `entity_type`, `entity_id?`, `success`, `metadata`, `ip`, `user_agent`, `created_at`.
- Store safe metadata only (no secrets).
- Minimum events:
  - Auth/login attempts (success/failure).
  - Content item create/update/delete.
  - Tag changes.
  - Settings changes.
  - Import/migration runs.

## Data Model Changes

- Add a migration for `audit_logs` table.

## Testing

- CRUD route tests: happy paths and 400/404 cases.
- Ensure pagination defaults and caps.
- Basic audit log insert verification for at least one CRUD event.

## Open TODOs

- Add auth guard (currently open for local dev only).
- Decide how to browse audit logs (admin UI or CLI).
