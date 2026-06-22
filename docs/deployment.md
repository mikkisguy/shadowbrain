# Deployment Guide

ShadowBrain is designed for a single-VPS deployment behind an nginx
reverse proxy. This guide covers the production environment checklist,
Docker Compose deployment, nginx configuration, and operational tasks.

---

## Production environment checklist

Before deploying, ensure your `.env` is fully configured:

### Required

| Variable              | Production value                               |
| --------------------- | ---------------------------------------------- |
| `NODE_ENV`            | `production`                                   |
| `DOMAIN`              | Your domain (e.g., `brain.example.com`)        |
| `DATA_DIR`            | `/app/data` (Docker volume mount)              |
| `SESSION_SECRET`      | `openssl rand -hex 32` (≥ 32 chars)            |
| `ADMIN_USERNAME`      | Your admin login name                          |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash (cost ≥ 10) — `pnpm hash:password` |

### Optional but recommended

| Variable                     | Notes                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| `SESSION_MAX_AGE`            | Session lifetime in ms (default 24h)                                    |
| `TRUSTED_PROXY_HEADER`       | `X-Forwarded-For` (nginx sets this)                                     |
| `OPENROUTER_API_KEY`         | For AI processing (see [AI Processing](ai-processing.md))               |
| `AI_MODEL`                   | OpenRouter model (default: `mistralai/mistral-7b-instruct`)             |
| `DISCORD_BOT_TOKEN`          | For Discord capture (see [Interaction Methods](interaction-methods.md)) |
| `DISCORD_GUILD_ID`           | Discord server ID                                                       |
| `DISCORD_JOURNAL_CHANNEL_ID` | Discord journal channel ID                                              |

> **Never commit `.env` to version control.** The `.gitignore` excludes
> it. Use the `.env.template` as a starting point.

---

## Docker Compose deployment

ShadowBrain ships with a multi-stage [`Dockerfile`](../Dockerfile) and
[`docker-compose.yml`](../docker-compose.yml) for production.

### Architecture

```
Internet → nginx (port 80/443) → app (port 3000, internal)
                                      ↓
                                 shadowbrain_data volume
                                   (SQLite DB + images)
```

### Services

| Service | Image                 | Purpose                        |
| ------- | --------------------- | ------------------------------ |
| `app`   | Built from Dockerfile | Next.js standalone server      |
| `nginx` | `nginx:alpine`        | Reverse proxy (ports 80 / 443) |

### Running

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# View app logs only
docker compose logs -f app

# Stop services
docker compose down

# Stop and remove volumes (⚠️ deletes the database)
docker compose down -v
```

The app is available at `http://localhost` (or your domain).

### What the Dockerfile does

The multi-stage build:

1. **deps** — installs npm dependencies (including `better-sqlite3`
   native compilation).
2. **builder** — builds the sqlite-vec C extension from source (with
   AVX/NEON optimization), then runs `pnpm build`.
3. **runner** — copies the standalone Next.js output, migrations, and
   the `vec0.so` extension. Runs as a non-root `nextjs` user. Verifies
   the `better-sqlite3` native module works before starting.

The production image uses Next.js's [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
mode — a minimal `node server.js` with only the files needed to run.

---

## Nginx configuration

The included [`nginx.conf`](../nginx.conf) is mounted read-only into the
nginx container. Key settings:

- **Upstream:** `app:3000` with health checks (`max_fails=3
fail_timeout=30s`) and keepalive (32 connections).
- **Body size:** `client_max_body_size 20M` — accommodates image
  uploads.
- **Health check:** `/health` with short timeouts (5s) and access log
  off.
- **Proxy headers:** sets `X-Real-IP`, `X-Forwarded-For`,
  `X-Forwarded-Proto` so the app sees the real client IP.
- **Static assets:** `/_next/static` gets `Cache-Control: public,
immutable`.
- **Timeouts:** 60s read timeout (accommodates full-text search queries),
  5s connect timeout.

### TLS / HTTPS

The included `nginx.conf` listens on port 80 only. For production with
TLS:

1. Obtain certificates (Let's Encrypt / certbot).
2. Add a `listen 443 ssl` server block with your certificate paths.
3. Add an HTTP → HTTPS redirect.
4. Set `TRUSTED_PROXY_HEADER=X-Forwarded-For` so the app reads the real
   client IP.

> **HSTS** is already sent by the app on every response
> (`max-age=63072000; includeSubDomains`), so once TLS is active the
> browser will pin HTTPS automatically.

---

## Database persistence

The `shadowbrain_data` Docker volume persists the SQLite database and
uploaded images across container restarts:

```yaml
volumes:
  - shadowbrain_data:/app/data
```

To back up, see [Database > Backup](database.md#backup). To inspect:

```bash
# Open a shell in the app container
docker compose exec app sh

# The database is at /app/data/shadowbrain.db
```

---

## Updating

```bash
# Pull the latest code
git pull origin main

# Rebuild and restart
docker compose up -d --build

# Migrations run automatically on startup — no manual step needed.
```

---

## Monitoring

### Health check

The nginx config exposes `/health` (proxied to the app) with short
timeouts. Use it for uptime monitoring:

```bash
curl http://localhost/health
```

### Logs

```bash
# Follow all logs
docker compose logs -f

# Last 100 lines from the app
docker compose logs --tail 100 app

# Grep for errors
docker compose logs app 2>&1 | grep -i error
```

The app logs structured JSON with an `event` key and `level`
(`debug` / `info` / `warn` / `error`). Debug logs are suppressed in
production.

### Audit log

Auth events (login success/failure, logout) and content mutations
(create/update/delete) are recorded in the `audit_logs` table. Query it
directly:

```bash
docker compose exec app node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/app/data/shadowbrain.db');
  console.log(db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20').all());
"
```

---

## Security hardening checklist

Before exposing ShadowBrain to the public internet:

- [ ] **TLS** — serve over HTTPS (Let's Encrypt + nginx).
- [ ] **Strong `SESSION_SECRET`** — `openssl rand -hex 32`.
- [ ] **Strong admin password** — bcrypt cost ≥ 10.
- [ ] **nginx sets `X-Forwarded-For`** — so rate limiting and audit
      logs see the real client IP.
- [ ] **Firewall** — only expose ports 80/443; keep 3000 internal.
- [ ] **Regular backups** — see [Database > Backup](database.md#backup)
      and the in-app `/backup` reminder.
- [ ] **CodeQL** — CI runs on every PR. Run locally with
      `./scripts/codeql-scan.sh`.

The full security policy is in the
[App Security Baseline spec](superpowers/specs/2026-06-19-app-security-baseline-design.md).

---

## Native deployment (without Docker)

For running directly on a VPS with systemd:

1. Install Node.js ≥ 24 and pnpm.
2. Clone the repo, `pnpm install`, `pnpm build`.
3. Build sqlite-vec: `./scripts/build-sqlite-vec.sh`.
4. Configure `.env` with production values.
5. Run with a process manager:

```bash
# Using pm2
pm2 start "node .next/standalone/server.js" --name shadowbrain

# Or systemd unit
[Unit]
Description=ShadowBrain
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/shadowbrain
EnvironmentFile=/opt/shadowbrain/.env
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
User=shadowbrain

[Install]
WantedBy=multi-user.target
```

6. Put nginx in front (use the included `nginx.conf` as a template,
   pointing `upstream app` at `127.0.0.1:3000`).
