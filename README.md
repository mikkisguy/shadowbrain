<div align="center">
<img width="150" height="148" alt="image" src="https://raw.githubusercontent.com/mikkisguy/shadowbrain/refs/heads/main/public/logo.png" />

---

# ShadowBrain

[![Version](https://img.shields.io/badge/version-0.8.0-yellow)](CHANGELOG.md)

</div>

ShadowBrain is a personal knowledge management system that treats every thought - raw captures, journal entries, knowledge notes, bookmarks, people, projects, questions, and events - as nodes in a rich, typed graph.

---

- **Everything in one database** — no split between "journal here" and "notes there." One query across your entire brain.
- **Semantic search** — find thoughts by _meaning_, not just keywords.
- **Typed links** — `inspired by`, `contradicts`, `builds upon`, `involves`, `bookmarked for` — not just "related to."
- **Frictionless capture** — Discord, web, voice. Under 3 seconds from thought to saved.
- **Hermes is the interface** — your AI assistant is the primary interaction layer. Talk to it like a person.
- **Web chat at `/chat`** — talk to Hermes (with tool-progress + approval for admin actions) or an OpenCode Go model, optionally grounded in your knowledge base. Save messages back to ShadowBrain with one click.
- **Local-first, portable forever** — SQLite database. One file. Copy it anywhere. Export everything to Markdown.

---

## Tech Stack

| Layer             | Technology                                                              |
| ----------------- | ----------------------------------------------------------------------- |
| **Database**      | SQLite + `sqlite-vec` (semantic search) + FTS5 (full-text)              |
| **Backend**       | Next.js (App Router, TypeScript)                                        |
| **Frontend**      | React 19 + Tailwind CSS + shadcn/ui                                     |
| **AI Interface**  | Hermes Agent + OpenCode Go models (web chat at `/chat`)                 |
| **Capture**       | Discord WebSocket listener, Web UI, API                                 |
| **AI Processing** | OpenRouter (background jobs: nightly compilation, auto-tag, auto-title) |
| **Deployment**    | Docker Compose + nginx reverse proxy                                    |

---

## Security

ShadowBrain is designed for a public-VPS deployment and ships with a defense-in-depth security baseline. The full policy is in the [App Security Baseline spec](docs/superpowers/specs/2026-06-19-app-security-baseline-design.md); at a glance:

- **Session-based auth** with `HttpOnly` / `Secure` / `SameSite=Lax` cookies, rate-limited login, constant-time credential check (OWASP ASVS V3.2.2).
- **Two-level visibility** on every item: `is_hidden` (out of casual views, AI-OK) and `is_private` (out of views; AI only on per-thread opt-in).
- **CSRF** via origin check (constant-time compare, exact-pathname exempt list), **standard security headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), **global rate limiting** per IP.
- **Regular backups** of the database to Proton Drive (E2E encrypted by the destination), with an in-app reminder — see the [backup reminder spec](docs/superpowers/specs/2026-06-19-backup-reminder-design.md).
- **SSRF protection** on URL-fetch endpoints (bookmark auto-fetch, image capture) — private / loopback / link-local addresses are blocked.
- **CI security** (CodeQL, lint CI, Renovate, `SECURITY.md`) so every PR is scanned, linted, typechecked, and tested.

> **Back up your database to Proton Drive regularly** — the in-app reminder at `/backup` will prompt you, and the guide there walks through the one-time setup (Proton Drive CLI + `/ShadowBrain Backups` folder) and the backup script.

## Development

```bash
pnpm install
pnpm dev          # Start dev server (localhost:3000)
pnpm test         # Run tests
pnpm typecheck    # TypeScript type check
pnpm lint         # Lint
pnpm format       # Format
```

The full technical reference (commands, code style, security scanning, agent skills) is in [`AGENTS.md`](AGENTS.md).

---

## Documentation

- [Getting Started](docs/getting-started.md) — Prerequisites, install, config, first run
- [Codebase Guide](docs/codebase.md) — Directory structure, entry points, patterns
- [Database](docs/database.md) — Migrations, query helpers, seeding, backup
- [Testing](docs/testing.md) — Test patterns, helpers, running suites
- [Deployment](docs/deployment.md) — Production env, Docker, nginx, monitoring
- [AI Processing](docs/ai-processing.md) — Embedding pipeline, nightly job architecture
- [Troubleshooting](docs/troubleshooting.md) — Common errors, debugging rate-limit/CSRF/SSRF
- [API Reference](docs/api/openapi.yaml) — OpenAPI 3.1 spec
- [API Endpoints](docs/api/endpoints/) — Per-endpoint detail pages
- [Vision & Design Principles](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Database Schema](docs/schema.md)
- [Feature Catalog](docs/features.md)
- [Interaction Methods](docs/interaction-methods.md)
- [Hermes Integration](docs/hermes-integration.md)
- [Implementation Phases](docs/phases.md)
- **Roadmap:** [#41](https://github.com/mikkisguy/shadowbrain/issues/41)

### Design specs

- [Web UI Core](docs/superpowers/specs/2026-05-07-web-ui-core-design.md)
- [Chat Interface](docs/superpowers/specs/2026-06-19-chat-interface-design.md)
- [App Security Baseline](docs/superpowers/specs/2026-06-19-app-security-baseline-design.md)
- [Design System](docs/superpowers/specs/2026-06-20-design-system-design.md)

---

## Docker Deployment

ShadowBrain includes Docker Compose configuration for production deployment with nginx reverse proxy.

### Prerequisites

- Docker and Docker Compose installed
- A `.env` file (copy from `.env.template` and fill in your values)
- The Proton Drive CLI installed on the VPS for the backup flow (see the in-app `/backup` guide)

### Running with Docker

```bash
# Start all services (app + nginx)
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Stop and remove volumes (cleans database)
docker compose down -v
```

The app will be available at `http://localhost` (ports 80/443).

### Services

- **app**: Next.js application on port 3000 (internal)
- **nginx**: Reverse proxy on ports 80 and 443
- **data**: Persistent volume for SQLite database and uploads

---
