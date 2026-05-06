# Implementation Phases

Building ShadowBrain from scratch, in testable chunks.

---

## Phase 0 — Foundation (now)

**Goal:** Project scaffold, schema ready, documentation complete. Zero user-facing features.

### Tasks

| #   | Task                                                                                                       | Deliverable                                      |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0.1 | Initialize Next.js project with TypeScript, Tailwind, shadcn/ui                                            | Working dev server at localhost:3000             |
| 0.2 | Set up `better-sqlite3` with schema migration system                                                       | `src/db/` with schema.ts, migrations, index.ts   |
| 0.3 | Create all tables: `content_items`, `content_links`, `tags`, `content_tags`, `journal_periods`, `settings` | Working DB with `pnpm run setup`                 |
| 0.4 | Set up FTS5 virtual table + triggers                                                                       | Full-text search working                         |
| 0.5 | Add `sqlite-vec` extension (compile for Docker)                                                            | Extension loaded, `content_vectors` table exists |
| 0.6 | Docker Compose setup (app + cron containers)                                                               | `docker compose up` runs the app                 |
| 0.7 | nginx reverse proxy configuration                                                                          | `$DOMAIN` → app (or new subdomain)               |
| 0.8 | Environment config (.env) + settings table defaults                                                        | API keys, tokens, model config                   |

**Testable:** `SELECT * FROM content_items` returns empty set. Schema migrations run cleanly.

---

## Phase 1 — Core Data Layer

**Goal:** CRUD API working on unified schema. Migration from journal-shadows complete.

### Tasks

| #    | Task                                                                                      | Deliverable                                  |
| ---- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1.1  | `POST /api/items` — create any content type                                               | Curl-testable create with validation         |
| 1.2  | `GET /api/items` — list with type, tag, date filters                                      | Paginated list with filters                  |
| 1.3  | `GET /api/items/[id]` — single item with links + tags                                     | Full detail view                             |
| 1.4  | `PATCH /api/items/[id]` — update content, tags, links                                     | Update with auto-trigger for FTS reindex     |
| 1.5  | `DELETE /api/items/[id]` — cascade delete                                                 | Links, tags, vectors cleaned up              |
| 1.6  | `POST /api/links` — create typed links                                                    | Bidirectional link creation                  |
| 1.7  | `GET /api/search?q=...` — FTS5 search                                                     | Keyword search with ranking                  |
| 1.8  | `GET /api/tags` + `POST /api/tags` — tag CRUD                                             | Tag management                               |
| 1.9  | `POST /api/items` with URL → auto-fetch bookmark metadata                                 | Bookmark creation with og:title, description |
| 1.10 | Migration script: journal-shadows DB → ShadowBrain schema                                 | All 65 existing items migrated               |
| 1.11 | Markdown note importer: reads `markdown/` directory, creates `content_items` types='note' | ~50 notes imported                           |
| 1.12 | Image API route: `/api/images/[...path]` (from journal-shadows)                           | Existing images still load                   |

**Testable:** Full CRUD via curl. Old data accessible through new API. FTS search returns results.

---

## Phase 2 — Capture Pipeline

**Goal:** Content flows into ShadowBrain from Discord and web. Zero friction.

### Tasks

| #   | Task                                                     | Deliverable                              |
| --- | -------------------------------------------------------- | ---------------------------------------- |
| 2.1 | Port WebSocket listener to ShadowBrain (new SQLite path) | Discord messages captured instantly      |
| 2.2 | Add Hermes capture endpoint or direct DB write           | "Save this" in Hermes → saved            |
| 2.3 | Web UI quick add form (text + type selector)             | `/add` page with instant save            |
| 2.4 | Web UI bookmark add (paste URL → auto-fetch)             | One-click bookmark save                  |
| 2.5 | Auto-tagging on intake (LLM suggests tags)               | Optional, reviewable tag suggestions     |
| 2.6 | Image capture: download + WebP conversion + save         | Working from both Discord and web upload |

**Testable:** Post in #journal → appears in DB. Use quick add form → appears in browse. Hermes captures save correctly.

---

## Phase 3 — Web UI Core

**Goal:** Browse, search, and explore your knowledge from the web.

### Tasks

| #   | Task                                               | Deliverable                           |
| --- | -------------------------------------------------- | ------------------------------------- |
| 3.1 | Unified browse page (all content, infinite scroll) | `/` shows feed with type filter tabs  |
| 3.2 | Item detail page (markdown render, tags, links)    | `/item/[id]` with full metadata       |
| 3.3 | Search bar with debounce and results overlay       | Type to search, see results instantly |
| 3.4 | Tag filter (multi-select)                          | Filter feed by one or more tags       |
| 3.5 | Tag management page                                | Create, rename, delete, merge tags    |
| 3.6 | Dark mode polish (proper palette, not inverted)    | Premium dark UI                       |
| 3.7 | Responsive layout (mobile/tablet/desktop)          | Usable on all screen sizes            |
| 3.8 | Settings page (AI model, API keys)                 | Configure from UI                     |

**Testable:** Browse all content. Search works. Click into items. Filter by tags. Looks good on phone.

---

## Phase 4 — AI Features

**Goal:** Nightly compilation, semantic search, Hermes integration deepens.

### Tasks

| #   | Task                                                                    | Deliverable                                       |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| 4.1 | Nightly compilation: raw entries → journal entry (from journal-shadows) | 4 AM cron compiles yesterday's raw entries        |
| 4.2 | Auto-title generation (LLM)                                             | Journal entries and notes get suggested titles    |
| 4.3 | Nightly Discord posting: summary + link + new daily thread              | Compiled entries posted to #journal automatically |
| 4.4 | Vector embedding: batch-embed all existing content                      | `content_vectors` populated                       |
| 4.5 | Vector embedding on create: auto-embed new items                        | New items get vectors on save                     |
| 4.6 | `GET /api/search?q=...&semantic=true` — hybrid search                   | Semantic + keyword combined results               |
| 4.7 | Hermes semantic queries: "find notes similar to..."                     | Working end-to-end                                |
| 4.8 | Auto-link suggestions: LLM detects potential [[wikilinks]]              | System suggests links on save                     |

**Testable:** Wait until 4 AM → journal entry appears. Search "docker" → finds semantically related content even without exact keyword match.

---

## Phase 5 — Polish & Backfill

**Goal:** Dense knowledge graph, premium feel, everything connected.

### Tasks

| #   | Task                                                          | Deliverable                                 |
| --- | ------------------------------------------------------------- | ------------------------------------------- |
| 5.1 | Discord history backfill: pull all past #journal messages     | Historical raw entries imported             |
| 5.2 | External data import: support JSON, CSV, markdown bulk import | Import page in settings                     |
| 5.3 | Link completeness sweep: detect and suggest missing links     | Fewer orphan nodes                          |
| 5.4 | Graph visualization page (force-directed, clickable)          | `/graph` shows your knowledge web           |
| 5.5 | "On this day" resurfacing                                     | Home page shows past entries from this date |
| 5.6 | Performance tuning: FTS5 optimization, index tuning           | Fast searches on large datasets             |
| 5.7 | Markdown export: dump all/some content to .md files           | `/api/export/markdown` working              |
| 5.8 | Browser bookmarklet                                           | One-click save from any browser             |
| 5.9 | Old schema cleanup: remove journal-shadows tables (optional)  | Clean slate, backup preserved               |

---

## Phase 6 — Future (P3 features)

_Not scheduled. Build when needed._

- Mood/energy tracking with journaling
- Mobile PWA with quick capture widget
- Email-to-inbox capture
- Contradiction / gap analysis
- Project scaffolding from connected notes
- Spaced repetition resurfacing
- Raycast/Alfred integration
- Public sharing / curated export

