# Auth Endpoints

Session-based authentication for the single-user admin.

---

## POST /api/auth/login

Authenticate and establish a session.

### Request

```http
POST /api/auth/login
Content-Type: application/json
Origin: http://localhost:3000
```

```json
{
  "username": "admin",
  "password": "your-password"
}
```

### Responses

| Status | Description                                                            |
| ------ | ---------------------------------------------------------------------- |
| 200    | Success — `Set-Cookie: sb_session=...; HttpOnly; Secure; SameSite=Lax` |
| 400    | Invalid JSON                                                           |
| 401    | Invalid credentials (generic message)                                  |
| 429    | Rate limited (~5 attempts / 15 min / IP)                               |

### Response (200)

```json
{ "ok": true }
```

### Notes

- Rate limit resets on successful login.
- Session lifetime: `SESSION_MAX_AGE` (default 24h, sliding renewal).
- Audit log: `auth.login.success` / `auth.login.failure`.

---

## POST /api/auth/logout

Clear the session and redirect.

### Request

```http
POST /api/auth/logout
Cookie: sb_session=...
```

### Responses

| Status | Description                              |
| ------ | ---------------------------------------- |
| 303    | Redirect to `/login` with cleared cookie |

### Notes

- Safe to call without a session — response is identical.
- Audit log: `auth.logout`.
