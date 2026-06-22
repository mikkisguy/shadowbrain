# Troubleshooting

Common issues, error messages, and debugging techniques for ShadowBrain.

---

## Quick diagnosis

| Symptom                                | Likely cause             | See                                  |
| -------------------------------------- | ------------------------ | ------------------------------------ |
| 401 on every API call                  | Missing/invalid session  | [Auth issues](#authentication)       |
| 429 Too Many Requests                  | Rate limit exceeded      | [Rate limiting](#rate-limiting)      |
| 403 Forbidden on POST/PATCH/DELETE     | CSRF origin mismatch     | [CSRF](#csrf-origin-check)           |
| "blocked IP" on bookmark fetch         | SSRF guard triggered     | [SSRF](#ssrf-protection)             |
| Vector search returns nothing          | sqlite-vec not loaded    | [sqlite-vec](#sqlite-vec-not-loaded) |
| "directory does not exist" on startup  | `DATA_DIR` misconfigured | [Database](#database-issues)         |
| Login fails with "Invalid credentials" | Wrong hash or username   | [Auth](#authentication)              |

---

## Authentication

### Symptom: 401 on every API call

**Cause:** The request lacks a valid session cookie, or the cookie is
expired / tampered with.

**Debug steps:**

1. Check that the `SESSION_SECRET` in `.env` hasn't changed — changing
   it invalidates all existing sessions.
2. Verify the cookie is being sent: check `Set-Cookie` on the login
   response and `Cookie` on subsequent requests.
3. Check `SESSION_MAX_AGE` — the session expires after this many
   milliseconds of inactivity (sliding renewal). Default: 24h.
4. Look in the audit log for `auth.login.failure` events:
   ```sql
   SELECT * FROM audit_logs
   WHERE action LIKE 'auth.%'
   ORDER BY created_at DESC LIMIT 20;
   ```

### Symptom: Login always fails with "Invalid credentials"

**Cause:** The `ADMIN_PASSWORD_HASH` doesn't match the password, or
`ADMIN_USERNAME` is wrong.

**Debug steps:**

1. Regenerate the hash:
   ```bash
   pnpm hash:password
   # Enter your password, copy the hash
   ```
2. Verify the hash starts with `$2b$10$` (or higher cost).
3. Ensure `ADMIN_USERNAME` matches exactly what you type at login.
4. The login route uses a constant-time comparison and runs a dummy
   bcrypt hash even when the username is wrong (to prevent timing
   attacks). This means you can't tell from response time whether the
   username or password is wrong — check the server logs for
   `reason: "no-such-user"` vs `reason: "wrong-password"`.

### Symptom: Redirected to `/login` immediately after logging in

**Cause:** The session cookie isn't being set or persisted.

**Debug steps:**

1. Check `NODE_ENV` — in production, the cookie is `Secure` (HTTPS
   only). If you're accessing the app over HTTP (no TLS), the browser
   won't store the cookie. Set `NODE_ENV=development` for local testing,
   or use HTTPS.
2. Check the `DOMAIN` env var — it should match the host the browser is
   using.

---

## Rate limiting

ShadowBrain enforces three rate-limit buckets per IP (in-memory
token-bucket, see [`src/lib/security.config.ts`](../src/lib/security.config.ts)):

| Bucket  | Limit        | Window | Applies to                |
| ------- | ------------ | ------ | ------------------------- |
| login   | 5 requests   | 15 min | `POST /api/auth/login`    |
| api     | 120 requests | 1 min  | All other `/api/*` routes |
| default | 600 requests | 1 min  | All other (page) routes   |

### Symptom: 429 Too Many Requests

**Cause:** The IP has exceeded its bucket.

**Debug steps:**

1. Check the `Retry-After` header (in seconds) — wait that long.
2. The rate limiter reads the client IP from `TRUSTED_PROXY_HEADER`
   (default `X-Forwarded-For`). If nginx isn't setting this header,
   every request falls into the same `"unknown"` bucket and you'll hit
   the limit much faster.
3. Verify nginx config includes:
   ```nginx
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   ```
4. The login bucket resets on a **successful** login — if you're
   locked out after failed attempts, a correct login clears the bucket.

### Symptom: All requests from different IPs get rate-limited

**Cause:** The trusted proxy header is missing, so every request uses
the IP `"unknown"`.

**Fix:** Ensure your reverse proxy sets `X-Forwarded-For` (or whichever
header `TRUSTED_PROXY_HEADER` points to). See the App Security Baseline
spec §5 for details.

---

## CSRF origin check

ShadowBrain protects state-changing requests (POST, PATCH, PUT, DELETE)
with an origin check in [`src/lib/auth/csrf.ts`](../src/lib/auth/csrf.ts).
The check compares the `Origin` (or `Referer`) header against the app's
configured origin using a constant-time comparison.

### Symptom: 403 Forbidden on POST/PATCH/DELETE

**Cause:** The `Origin` or `Referer` header doesn't match the app's
configured origin.

**Debug steps:**

1. If calling the API from a script or external client, include the
   `Origin` header matching your `DOMAIN`.
2. The app is **same-origin only** — there is no CORS configuration. A
   browser-based request from a different origin will be blocked by both
   the CSRF check and the browser's same-origin policy.
3. Exempt paths (exact match only): `/login` and `/api/auth/*`. No
   suffix or prefix matching — see `src/lib/auth/exempt-paths.ts`.

### Symptom: Works in browser but fails from curl/fetch

**Cause:** CLI tools don't send an `Origin` header by default.

**Fix:** Add the header explicitly:

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -H "Cookie: sb_session=..." \
  -d '{"type":"note","content":"hello"}'
```

---

## SSRF protection

All URL-fetch endpoints (bookmark auto-fetch, image capture) validate
URLs through [`src/lib/ssrf.ts`](../src/lib/ssrf.ts) before making HTTP
requests. The validator blocks private, loopback, and link-local IP
ranges, rejects non-http(s) schemes, and prevents DNS rebinding.

### Symptom: Bookmark auto-fetch returns "blocked IP"

**Cause:** The bookmark URL resolves to a private or blocked IP range.

**What's blocked:**

| Range             | Example                               |
| ----------------- | ------------------------------------- |
| Private (RFC1918) | `10.x`, `172.16-31.x`, `192.168.x`    |
| Loopback          | `127.x`, `::1`                        |
| Link-local        | `169.254.x` (includes cloud metadata) |
| CGNAT             | `100.64-127.x`                        |
| Unspecified       | `0.x`, `::`                           |
| Non-http(s)       | `file:`, `javascript:`, `data:`       |

**Note:** This is by design — the SSRF guard prevents the server from
being used to probe internal services. There is no allowlist override.
The bookmark is still saved; only the metadata auto-fetch fails.

### Symptom: Bookmark metadata fetch fails with "DNS resolution failed"

**Cause:** The domain doesn't resolve or the DNS query timed out (3s
default).

**Debug steps:**

1. Check the URL is valid and the domain exists.
2. The fetch has a 5s total timeout and 3s DNS timeout (see
   `SSRF_POLICY` in `security.config.ts`).
3. Server-side logs record the actual hostname and error (the client
   only sees the generic "DNS resolution failed" message).

---

## sqlite-vec not loaded

### Symptom: Vector search returns nothing / "extension not loaded" warning

**Cause:** The `vec0.so` extension isn't available.

**Debug steps:**

1. Check server startup logs for:
   ```
   ✓ Loaded sqlite-vec extension from: .../vec0.so
   ```
   If you see `sqlite-vec extension not loaded` instead, the file is
   missing.
2. Build it locally: `./scripts/build-sqlite-vec.sh`
3. In Docker, the Dockerfile builds it automatically. If it's missing,
   rebuild the image: `docker compose up -d --build`
4. Verify the file exists:
   ```bash
   ls -la dist/extensions/vec0.so
   ```
5. The app degrades gracefully — FTS5 search still works, only semantic
   search is unavailable.

---

## Database issues

### Symptom: "directory does not exist" on startup

**Cause:** `DATA_DIR` points to a path that can't be created, or is
relative to the wrong working directory.

**Debug steps:**

1. The app resolves `DATA_DIR` relative to `process.cwd()` (the project
   root). Verify the working directory.
2. Use an absolute path for `DATA_DIR` to avoid ambiguity.
3. In Docker, `DATA_DIR=/app/data` and the volume is mounted there.

### Symptom: Migration errors on startup

**Cause:** A migration failed partway, leaving the DB in an
inconsistent state.

**Debug steps:**

1. Check the `schema_migrations` table:
   ```sql
   SELECT * FROM schema_migrations ORDER BY version;
   ```
2. Each migration runs in a transaction — a failed migration is rolled
   back and its version is NOT recorded. Re-running should retry it.
3. If the database is corrupt, the cleanest fix is to restore from
   backup (see [Database > Backup](database.md#backup)).

### Symptom: Tests fail with "database is locked"

**Cause:** Another process holds a lock on the test database file.

**Debug steps:**

1. Ensure no dev server is running when you run tests (they use
   different files, but a stale process can interfere).
2. Each vitest worker gets its own `.test.<worker>.db` file — if you
   see lock errors, check for orphaned processes:
   ```bash
   ps aux | grep vitest
   ```
3. Clean up test databases:
   ```bash
   pnpm test:db:cleanup
   ```

---

## Build issues

### Symptom: `better-sqlite3` native compilation fails

**Cause:** Missing build tools (python3, make, g++).

**Fix:**

```bash
# Ubuntu/Debian
sudo apt-get install python3 make g++

# macOS (Xcode command line tools)
xcode-select --install
```

Then reinstall:

```bash
pnpm rebuild better-sqlite3
```

### Symptom: TypeScript errors after adding a migration

**Cause:** If the migration adds a column, the `ContentItem` type in
`src/db/repositories/content-items.ts` may need updating.

**Fix:** Add the new field to the `ContentItem` interface. Types are
hand-written (not inferred from SQL), so schema changes require a
manual type update.

---

## Getting help

- Check the [Architecture overview](architecture.md) for system design.
- Read the [Codebase guide](codebase.md) for how things fit together.
- Review the [App Security Baseline spec](superpowers/specs/2026-06-19-app-security-baseline-design.md)
  for security behavior.
- File an issue on [GitHub](https://github.com/mikkisguy/shadowbrain/issues).
