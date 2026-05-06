     1|# Architecture
     2|
     3|## System Overview
     4|
     5|```
     6|┌──────────────────────────────────────────────────────────┐
     7|│                      USER                                │
     8|│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
     9|│  │ Discord  │  │ Web UI   │  │  API     │  ...more     │
    10|│  │ (Hermes) │  │ (Next.js)│  │ Clients  │              │
    11|│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
    12|│       │             │             │                      │
    13|├───────┼─────────────┼─────────────┼──────────────────────┤
    14|│       ▼             ▼             ▼                      │
    15|│  ┌─────────────────────────────────────┐                 │
    16|│  │         Next.js Backend             │                 │
    17|│  │  ┌──────────┐  ┌──────────────────┐ │                 │
    18|│  │  │ REST API │  │  AI Processor    │ │                 │
    19|│  │  │ (CRUD)   │  │  (nightly job)   │ │                 │
    20|│  │  └────┬─────┘  └────────┬─────────┘ │                 │
    21|│  │       │                 │           │                 │
    22|│  │  ┌────▼─────────────────▼─────────┐ │                 │
    23|│  │  │        better-sqlite3          │ │                 │
    24|│  │  │    + sqlite-vec (vectors)      │ │                 │
    25|│  │  │    + FTS5 (full-text)          │ │                 │
    26|│  │  └──────────────┬─────────────────┘ │                 │
    27|│  └─────────────────┼───────────────────┘                 │
    28|│                    │                                      │
    29|│              ┌─────▼──────┐                               │
    30|│              │  SQLite    │                               │
    31|│              │  shadowbrain │                               │
    32|│              │  .db       │                               │
    33|│              └────────────┘                               │
    34|│                                                           │
    35|│  ┌──────────────────────────────────────┐                 │
    36|│  │     Discord WebSocket Listener       │                 │
    37|│  │  (systemd service, host-level)       │                 │
    38|│  │  Captures → SQLite directly          │                 │
    39|│  └──────────────────────────────────────┘                 │
    40|│                                                           │
    41|│  ┌──────────────────────────────────────┐                 │
    42|│  │        Hermes Agent                  │                 │
    43|│  │  Reads SQLite, writes via API/DB     │                 │
    44|│  │  Primary user interface              │                 │
    45|│  └──────────────────────────────────────┘                 │
    46|│                                                           │
    47|│  ┌──────────────────────────────────────┐                 │
    48|│  │        Docker Compose                │                 │
    49|│  │  - shadowbrain (Next.js app)           │                 │
    50|│  │  - shadowbrain-cron (nightly AI)       │                 │
    51|│  │  - nginx (reverse proxy)             │                 │
    52|│  └──────────────────────────────────────┘                 │
    53|└──────────────────────────────────────────────────────────┘
    54|```
    55|
    56|## Tech Stack Details
    57|
    58|### Database: SQLite + extensions
    59|
    60|| Component | Purpose |
    61||-----------|---------|
    62|| `journal.db` | Main database (WAL mode for concurrency) |
    63|| `better-sqlite3` | Synchronous Node.js driver — fast, simple |
    64|| `sqlite-vec` | Vector storage for semantic/embedding search |
    65|| FTS5 | Full-text search with ranking |
    66|
    67|**Why SQLite over Postgres:**
    68|- Single-file backup (`cp journal.db backup.db`)
    69|- Zero operational overhead (no separate process, no auth, no pg_dump schedule)
    70|- `sqlite-vec` provides ANN similarity search
    71|- WAL mode handles concurrent reads from app + captures + Hermes
    72|
    73|### Backend: Next.js App Router
    74|
    75|- TypeScript throughout
    76|- REST API routes (`/api/items`, `/api/search`, `/api/tags`, `/api/links`)
    77|- AI processor (nightly journal compilation, auto-tagging, link suggestions)
    78|- Image handling (WebP conversion via `sharp`)
    79|- Auth: simple session-based (migrated from journal-shadows)
    80|
    81|### Frontend: React 19 + Tailwind + shadcn/ui
    82|
    83|- Dark mode by default
    84|- Server components for fast initial loads
    85|- Client components for interactive features (graph view, search, forms)
    86|- shadcn/ui for consistent, premium component library
    87|
    88|### Capture: Discord WebSocket Listener
    89|
    90|- Python script as systemd user service
    91|- Connects to Discord Gateway, captures from `#journal` and threads
    92|- Saves directly to SQLite (WAL-safe concurrent writes)
    93|- Converts images to WebP before saving
    94|- Zero polling delay, zero LLM token cost
    95|
    96|### AI Processing: OpenRouter
    97|
    98|- Configurable model (default: Mistral 7B or similar)
    99|- Nightly compilation: raw entries → journal entry + title + tags
   100|- Optional: auto-link suggestions, gap analysis, contradiction detection
   101|- All prompts grounded in user's own data
   102|
   103|### Deployment: Docker Compose + nginx
   104|
   105|```
   106|$DOMAIN → nginx → shadowbrain:3000
   107|```
   108|- Single `docker-compose.yml` with app + cron containers
   109|- Data mounted as volumes (DB, images, markdown exports)
   110|- `.env` for secrets (API keys, tokens)
   111|