# Security Policy

## Security Best Practices for Deployments

When deploying ShadowBrain in production:

1. **Generate a strong `SESSION_SECRET`** — at least 32 random bytes
   (`openssl rand -hex 32`). Never reuse the development value.
2. **Hash the admin password with bcrypt** (cost ≥ 10) and store the result
   in `ADMIN_PASSWORD_HASH`. Never store or commit plaintext passwords.
3. **Treat API keys as secrets** — `OPENROUTER_API_KEY`, `DISCORD_BOT_TOKEN`,
   SMTP credentials, and any other tokens must come from a secret manager
   (env vars, Docker secrets, KMS, …). Never commit them; never log them.
4. **Terminate HTTPS at nginx** (see `nginx.conf`) and redirect plain HTTP to
   HTTPS. Set `secure` and `SameSite=Lax` on the session cookie in production.
5. **Keep the host updated** — Node.js (current LTS), the package manager,
   and the OS. Renovate is configured to open weekly PRs for non-major
   dependency updates and to auto-merge dev-dependency patches.
6. **Back up the SQLite database and `data/` directory regularly**, store
   backups on a separate host/object store with retention, and encrypt
   backups at rest. If you add an encryption key (e.g. for at-rest
   application encryption), keep the key **separate from the backups** —
   losing the key must not be how you lose the data, but a leaked backup
   must not leak the key.
7. **Restrict network access** — only expose the ports nginx needs
   (80/443). The app should bind to localhost and talk to nginx via a
   reverse proxy.

## Known Security Considerations

- **Session cookies**: HTTP-only, `secure` and `SameSite=Lax` in production;
  configurable lifetime via `SESSION_MAX_AGE` (default 24h, clamped to 1h–30d)
  with sliding expiry.
- **Authentication**: single-user admin via username + bcrypt-hashed password
  (see `src/lib/auth`).
- **CSRF**: origin-check middleware on state-changing requests (see
  `src/lib/csrf`).
- **Rate limiting**: token-bucket per IP for auth and API routes; stricter
  limits on `/api/auth/login` (see `src/lib/rate-limit`).
- **Security headers**: CSP, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `Referrer-Policy`, etc. configured centrally in
  `src/lib/security.config.ts`.
- **Input validation**: every API route validates input with Zod before it
  reaches the database.
- **SQL**: all queries go through `better-sqlite3` parameterised helpers
  (no string concatenation) — SQL injection is structurally prevented.
