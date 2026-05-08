# Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────┐
│                      USER                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Discord  │  │ Web UI   │  │  API     │  ...more     │
│  │ (Hermes) │  │ (Next.js)│  │ Clients  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │             │             │                      │
├───────┼─────────────┼─────────────┼──────────────────────┤
│       ▼             ▼             ▼                      │
│  ┌─────────────────────────────────────┐                 │
│  │         Next.js Backend             │                 │
│  │  ┌──────────┐  ┌──────────────────┐ │                 │
│  │  │ REST API │  │  AI Processor    │ │                 │
│  │  │ (CRUD)   │  │  (nightly job)   │ │                 │
│  │  └────┬─────┘  └────────┬─────────┘ │                 │
│  │       │                 │           │                 │
│  │  ┌────▼─────────────────▼─────────┐ │                 │
│  │  │        better-sqlite3          │ │                 │
│  │  │    + sqlite-vec (vectors)      │ │                 │
│  │  │    + FTS5 (full-text)          │ │                 │
│  │  └──────────────┬─────────────────┘ │                 │
│  └─────────────────┼───────────────────┘                 │
│                    │                                      │
│              ┌─────▼──────┐                               │
│              │  SQLite    │                               │
│              │  shadowbrain │                               │
│              │  .db       │                               │
│              └────────────┘                               │
│                                                           │
│  ┌──────────────────────────────────────┐                 │
│  │     Discord WebSocket Listener       │                 │
│  │  (systemd service, host-level)       │                 │
│  │  Captures → SQLite directly          │                 │
│  └──────────────────────────────────────┘                 │
│                                                           │
│  ┌──────────────────────────────────────┐                 │
│  │        Hermes Agent                  │                 │
│  │  Reads SQLite, writes via API/DB     │                 │
│  │  Primary user interface              │                 │
│  └──────────────────────────────────────┘                 │
│                                                           │
│  ┌──────────────────────────────────────┐                 │
│  │        Docker Compose                │                 │
│  │  - shadowbrain (Next.js app)           │                 │
│  │  - shadowbrain-cron (nightly AI)       │                 │
│  │  - nginx (reverse proxy)             │                 │
│  └──────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────┘
```

## Tech Stack Details

### Database: SQLite + extensions

| Component        | Purpose                                      |
| ---------------- | -------------------------------------------- |
| `journal.db`     | Main database (WAL mode for concurrency)     |
| `better-sqlite3` | Synchronous Node.js driver — fast, simple    |
| `sqlite-vec`     | Vector storage for semantic/embedding search |
| FTS5             | Full-text search with ranking                |

**Why SQLite over Postgres:**

- Single-file backup (`cp journal.db backup.db`)
- Zero operational overhead (no separate process, no auth, no pg_dump schedule)
- `sqlite-vec` provides ANN similarity search
- WAL mode handles concurrent reads from app + captures + Hermes

### Backend: Next.js App Router

- TypeScript throughout
- REST API routes (`/api/items`, `/api/search`, `/api/tags`, `/api/links`)
- AI processor (nightly journal compilation, auto-tagging, link suggestions)
- Image handling (WebP conversion via `sharp`)
- Auth: simple session-based (migrated from journal-shadows)

### Frontend: React 19 + Tailwind + shadcn/ui

- Dark mode by default
- Server components for fast initial loads
- Client components for interactive features (graph view, search, forms)
- shadcn/ui for consistent, premium component library

### Capture: Discord WebSocket Listener

- Python script as systemd user service
- Connects to Discord Gateway, captures from `#journal` and threads
- Saves directly to SQLite (WAL-safe concurrent writes)
- Converts images to WebP before saving
- Zero polling delay, zero LLM token cost

### AI Processing: OpenRouter

- Configurable model (default: Mistral 7B or similar)
- Nightly compilation: raw entries → journal entry + title + tags

- Optional: auto-link suggestions, gap analysis, contradiction detection
- All prompts grounded in user's own data

### Deployment: Docker Compose + nginx

`
06|$DOMAIN → nginx → shadowbrain:3000
07|`

- Single `docker-compose.yml` with app + cron containers
- Data mounted as volumes (DB, images, markdown exports)
- `.env` for secrets (API keys, tokens)
