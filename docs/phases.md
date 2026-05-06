     1|# Implementation Phases
     2|
     3|Building ShadowBrain from scratch, in testable chunks.
     4|
     5|---
     6|
     7|## Phase 0 — Foundation (now)
     8|
     9|**Goal:** Project scaffold, schema ready, documentation complete. Zero user-facing features.
    10|
    11|### Tasks
    12|
    13|| # | Task | Deliverable |
    14||---|------|-------------|
    15|| 0.1 | Initialize Next.js project with TypeScript, Tailwind, shadcn/ui | Working dev server at localhost:3000 |
    16|| 0.2 | Set up `better-sqlite3` with schema migration system | `src/db/` with schema.ts, migrations, index.ts |
    17|| 0.3 | Create all tables: `content_items`, `content_links`, `tags`, `content_tags`, `journal_periods`, `settings` | Working DB with `pnpm run setup` |
    18|| 0.4 | Set up FTS5 virtual table + triggers | Full-text search working |
    19|| 0.5 | Add `sqlite-vec` extension (compile for Docker) | Extension loaded, `content_vectors` table exists |
    20|| 0.6 | Docker Compose setup (app + cron containers) | `docker compose up` runs the app |
    21|| 0.7 | nginx reverse proxy configuration | `$DOMAIN` → app (or new subdomain) |
    22|| 0.8 | Environment config (.env) + settings table defaults | API keys, tokens, model config |
    23|
    24|**Testable:** `SELECT * FROM content_items` returns empty set. Schema migrations run cleanly.
    25|
    26|---
    27|
    28|## Phase 1 — Core Data Layer
    29|
    30|**Goal:** CRUD API working on unified schema. Migration from journal-shadows complete.
    31|
    32|### Tasks
    33|
    34|| # | Task | Deliverable |
    35||---|------|-------------|
    36|| 1.1 | `POST /api/items` — create any content type | Curl-testable create with validation |
    37|| 1.2 | `GET /api/items` — list with type, tag, date filters | Paginated list with filters |
    38|| 1.3 | `GET /api/items/[id]` — single item with links + tags | Full detail view |
    39|| 1.4 | `PATCH /api/items/[id]` — update content, tags, links | Update with auto-trigger for FTS reindex |
    40|| 1.5 | `DELETE /api/items/[id]` — cascade delete | Links, tags, vectors cleaned up |
    41|| 1.6 | `POST /api/links` — create typed links | Bidirectional link creation |
    42|| 1.7 | `GET /api/search?q=...` — FTS5 search | Keyword search with ranking |
    43|| 1.8 | `GET /api/tags` + `POST /api/tags` — tag CRUD | Tag management |
    44|| 1.9 | `POST /api/items` with URL → auto-fetch bookmark metadata | Bookmark creation with og:title, description |
    45|| 1.10 | Migration script: journal-shadows DB → ShadowBrain schema | All 65 existing items migrated |
    46|| 1.11 | Markdown note importer: reads `markdown/` directory, creates `content_items` types='note' | ~50 notes imported |
    47|| 1.12 | Image API route: `/api/images/[...path]` (from journal-shadows) | Existing images still load |
    48|
    49|**Testable:** Full CRUD via curl. Old data accessible through new API. FTS search returns results.
    50|
    51|---
    52|
    53|## Phase 2 — Capture Pipeline
    54|
    55|**Goal:** Content flows into ShadowBrain from Discord and web. Zero friction.
    56|
    57|### Tasks
    58|
    59|| # | Task | Deliverable |
    60||---|------|-------------|
    61|| 2.1 | Port WebSocket listener to ShadowBrain (new SQLite path) | Discord messages captured instantly |
    62|| 2.2 | Add Hermes capture endpoint or direct DB write | "Save this" in Hermes → saved |
    63|| 2.3 | Web UI quick add form (text + type selector) | `/add` page with instant save |
    64|| 2.4 | Web UI bookmark add (paste URL → auto-fetch) | One-click bookmark save |
    65|| 2.5 | Auto-tagging on intake (LLM suggests tags) | Optional, reviewable tag suggestions |
    66|| 2.6 | Image capture: download + WebP conversion + save | Working from both Discord and web upload |
    67|
    68|**Testable:** Post in #journal → appears in DB. Use quick add form → appears in browse. Hermes captures save correctly.
    69|
    70|---
    71|
    72|## Phase 3 — Web UI Core
    73|
    74|**Goal:** Browse, search, and explore your knowledge from the web.
    75|
    76|### Tasks
    77|
    78|| # | Task | Deliverable |
    79||---|------|-------------|
    80|| 3.1 | Unified browse page (all content, infinite scroll) | `/` shows feed with type filter tabs |
    81|| 3.2 | Item detail page (markdown render, tags, links) | `/item/[id]` with full metadata |
    82|| 3.3 | Search bar with debounce and results overlay | Type to search, see results instantly |
    83|| 3.4 | Tag filter (multi-select) | Filter feed by one or more tags |
    84|| 3.5 | Tag management page | Create, rename, delete, merge tags |
    85|| 3.6 | Dark mode polish (proper palette, not inverted) | Premium dark UI |
    86|| 3.7 | Responsive layout (mobile/tablet/desktop) | Usable on all screen sizes |
    87|| 3.8 | Settings page (AI model, API keys) | Configure from UI |
    88|
    89|**Testable:** Browse all content. Search works. Click into items. Filter by tags. Looks good on phone.
    90|
    91|---
    92|
    93|## Phase 4 — AI Features
    94|
    95|**Goal:** Nightly compilation, semantic search, Hermes integration deepens.
    96|
    97|### Tasks
    98|
    99|| # | Task | Deliverable |
   100||---|------|-------------|
   101|| 4.1 | Nightly compilation: raw entries → journal entry (from journal-shadows) | 4 AM cron compiles yesterday's raw entries |
   102|| 4.2 | Auto-title generation (LLM) | Journal entries and notes get suggested titles |
   103|| 4.3 | Nightly Discord posting: summary + link + new daily thread | Compiled entries posted to #journal automatically |
   104|| 4.4 | Vector embedding: batch-embed all existing content | `content_vectors` populated |
   105|| 4.5 | Vector embedding on create: auto-embed new items | New items get vectors on save |
   106|| 4.6 | `GET /api/search?q=...&semantic=true` — hybrid search | Semantic + keyword combined results |
   107|| 4.7 | Hermes semantic queries: "find notes similar to..." | Working end-to-end |
   108|| 4.8 | Auto-link suggestions: LLM detects potential [[wikilinks]] | System suggests links on save |
   109|
   110|**Testable:** Wait until 4 AM → journal entry appears. Search "docker" → finds semantically related content even without exact keyword match.
   111|
   112|---
   113|
   114|## Phase 5 — Polish & Backfill
   115|
   116|**Goal:** Dense knowledge graph, premium feel, everything connected.
   117|
   118|### Tasks
   119|
   120|| # | Task | Deliverable |
   121||---|------|-------------|
   122|| 5.1 | Discord history backfill: pull all past #journal messages | Historical raw entries imported |
   123|| 5.2 | External data import: support JSON, CSV, markdown bulk import | Import page in settings |
   124|| 5.3 | Link completeness sweep: detect and suggest missing links | Fewer orphan nodes |
   125|| 5.4 | Graph visualization page (force-directed, clickable) | `/graph` shows your knowledge web |
   126|| 5.5 | "On this day" resurfacing | Home page shows past entries from this date |
   127|| 5.6 | Performance tuning: FTS5 optimization, index tuning | Fast searches on large datasets |
   128|| 5.7 | Markdown export: dump all/some content to .md files | `/api/export/markdown` working |
   129|| 5.8 | Browser bookmarklet | One-click save from any browser |
   130|| 5.9 | Old schema cleanup: remove journal-shadows tables (optional) | Clean slate, backup preserved |
   131|
   132|---
   133|
   134|## Phase 6 — Future (P3 features)
   135|
   136|*Not scheduled. Build when needed.*
   137|
   138|- Mood/energy tracking with journaling
   139|- Mobile PWA with quick capture widget
   140|- Email-to-inbox capture
   141|- Contradiction / gap analysis
   142|- Project scaffolding from connected notes
   143|- Spaced repetition resurfacing
   144|- Raycast/Alfred integration
   145|- Public sharing / curated export
   146|