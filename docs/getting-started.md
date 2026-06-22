# Getting Started

This guide walks through setting up ShadowBrain for local development —
from cloning the repo to a running dev server in under five minutes.

---

## Prerequisites

| Tool                      | Version | Notes                                                      |
| ------------------------- | ------- | ---------------------------------------------------------- |
| **Node.js**               | ≥ 24    | The Docker image pins `node:24-slim`. Use `nvm` or `fnm`.  |
| **pnpm**                  | ≥ 9     | Enabled via `corepack enable pnpm` after install.          |
| **Python 3 + make + g++** | —       | Needed to compile `better-sqlite3` native bindings.        |
| **curl + gettext-base**   | —       | Only needed to build the sqlite-vec extension (see below). |

> **sqlite-vec (optional):** Vector / semantic search requires the
> `sqlite-vec` C extension (`vec0.so`). If the extension is not built,
> the app starts normally and skips the vector-search migration —
> full-text search (FTS5) still works. See
> [Database > sqlite-vec](database.md#sqlite-vec-extension) for build
> instructions.

---

## 1. Clone and install

```bash
git clone https://github.com/mikkisguy/shadowbrain.git
cd shadowbrain
pnpm install
```

The install compiles `better-sqlite3` native bindings, so a C toolchain
(`python3 make g++`) must be present.

---

## 2. Build the sqlite-vec extension (optional)

Vector search needs the `vec0.so` shared library in `dist/extensions/`:

```bash
./scripts/build-sqlite-vec.sh
```

If you skip this step, the app runs fine — you just won't have semantic
search until the extension is available.

---

## 3. Configure environment variables

Copy the template and fill in the required values:

```bash
cp .env.template .env
```

### Required variables

| Variable              | Description                                   | How to generate                      |
| --------------------- | --------------------------------------------- | ------------------------------------ |
| `SESSION_SECRET`      | Signs session cookies (≥ 32 chars)            | `openssl rand -hex 32`               |
| `ADMIN_USERNAME`      | Single-user admin login name                  | Pick any string                      |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of the admin password (cost ≥ 10) | `pnpm hash:password` (hidden prompt) |

### Optional variables

| Variable               | Default                         | Notes                                                 |
| ---------------------- | ------------------------------- | ----------------------------------------------------- |
| `DATA_DIR`             | `./data`                        | SQLite DB + images live here                          |
| `AI_MODEL`             | `mistralai/mistral-7b-instruct` | OpenRouter model identifier                           |
| `EMBEDDING_MODEL`      | `all-MiniLM-L6-v2`              | Local sentence-transformers model                     |
| `SESSION_MAX_AGE`      | `86400000` (24h)                | Session lifetime in ms, clamped to [1h, 30d]          |
| `TRUSTED_PROXY_HEADER` | `X-Forwarded-For`               | Header carrying the real client IP behind a proxy     |
| `DISCORD_BOT_TOKEN`    | _(empty)_                       | Discord capture bot (see Interaction Methods)         |
| `OPENROUTER_API_KEY`   | _(empty)_                       | AI processing (see [AI Processing](ai-processing.md)) |

See [`.env.template`](../.env.template) for the full list with inline
comments.

### Generate the password hash

```bash
pnpm hash:password
# Prompts for a password (hidden), prints the bcrypt hash.
# Paste the hash into ADMIN_PASSWORD_HASH in .env.
```

---

## 4. Start the dev server

```bash
pnpm dev
```

The app runs at **http://localhost:3000**. On first launch, the
database is created automatically:

- `data/shadowbrain.dev.db` — the development database
- All migrations in `src/db/migrations/` are applied on first
  connection (see [Database](database.md)).

Navigate to http://localhost:3000 and log in with the credentials you
configured.

---

## 5. Verify the setup

Run the full verification chain:

```bash
pnpm verify
```

This runs lint → typecheck → build → test → knip (dead-code analysis).
See [Development Commands](../AGENTS.md#development-commands) for the
individual commands.

---

## Common commands

```bash
pnpm dev          # Start dev server (localhost:3000)
pnpm build        # Production build
pnpm test         # Run tests (watch mode)
pnpm test --run   # Run tests once
pnpm typecheck    # TypeScript type check
pnpm lint         # ESLint
pnpm format       # Prettier (all files)
```

---

## Database files

ShadowBrain uses a per-environment database file under `DATA_DIR`:

| Environment | File                           |
| ----------- | ------------------------------ |
| development | `shadowbrain.dev.db`           |
| test        | `shadowbrain.test.<worker>.db` |
| production  | `shadowbrain.db`               |

Each vitest worker gets its own test database (keyed by
`VITEST_POOL_ID`) so concurrent test files don't trample each other's
state. See [Database](database.md) for details.

---

## Where to go next

- [Codebase guide](codebase.md) — directory structure and key patterns
- [Database guide](database.md) — migrations, query helpers, backup
- [Testing guide](testing.md) — test patterns and helpers
- [Deployment guide](deployment.md) — Docker Compose, nginx, production
- [Architecture overview](architecture.md) — system design
- [Troubleshooting](troubleshooting.md) — common issues and fixes
