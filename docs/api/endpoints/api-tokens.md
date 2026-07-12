# API Token Authentication

API tokens allow programmatic (non-browser) access to content-management
endpoints. Tokens are bearer tokens that are passed via the
`Authorization` header.

## Creating a Token

Tokens are created through the settings UI (admin only) or via the API:

```bash
curl -X POST http://localhost:3000/api/admin/api-tokens \
  -H "Content-Type: application/json" \
  -H "Cookie: sb_session=..." \
  -d '{"name": "my-integration-token"}'
```

The response includes the raw token — shown only once:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-integration-token",
  "token": "sb_tok_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  "created_at": "2026-07-12T00:00:00.000Z"
}
```

Store the raw token securely. It cannot be retrieved again.

## Using a Token

Pass the token as a Bearer token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer sb_tok_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789" \
  http://localhost:3000/api/items
```

## Allowed Endpoints

Tokens grant access to content-management routes only:

| Endpoint          | Method(s)          |
| ----------------- | ------------------ |
| `/api/items`      | GET, POST          |
| `/api/items/[id]` | GET, PATCH, DELETE |
| `/api/tags`       | GET, POST          |
| `/api/tags/[id]`  | GET, PATCH, DELETE |
| `/api/links`      | GET, POST          |
| `/api/links/[id]` | GET, DELETE        |
| `/api/images`     | POST               |

## Denied Endpoints

The following endpoints reject token auth with **403 Forbidden**:

| Endpoint          | Reason                  |
| ----------------- | ----------------------- |
| `/api/settings`   | Admin-only              |
| `/api/settings/*` | Admin-only              |
| `/api/admin/*`    | Admin-only              |
| `/api/search`     | Not in token scope      |
| `/api/chat/*`     | Not in token scope      |
| `/api/export`     | Not in token scope      |
| `/api/auth/*`     | Exempt routes (session) |

Any path outside the scope list receives 403 with message
`"This token cannot access this endpoint"`.

## Full Example

```bash
# List items
curl -H "Authorization: Bearer sb_tok_..." \
  http://localhost:3000/api/items

# Create an item
curl -X POST http://localhost:3000/api/items \
  -H "Authorization: Bearer sb_tok_..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "note",
    "title": "API token test",
    "content": "Created via API token"
  }'

# List all tags
curl -H "Authorization: Bearer sb_tok_..." \
  http://localhost:3000/api/tags
```

## Revoking a Token

Tokens cannot be modified — only revoked. Revoke a token via the
settings UI or the API:

```bash
curl -X DELETE http://localhost:3000/api/admin/api-tokens/<id> \
  -H "Cookie: sb_session=..."
```

Revoked tokens are kept in the database but return null on verification,
so existing bearer-auth requests will immediately start failing.
