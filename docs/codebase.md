# Codebase Guide

A walkthrough of ShadowBrain's directory structure, key entry points, and
the patterns you'll encounter when contributing.

---

## Directory structure

```
shadowbrain/
├── src/
│   ├── app/                 # Next.js App Router (pages + API routes)
│   │   ├── api/             # REST API route handlers
│   │   │   ├── auth/        #   POST /login, POST /logout
│   │   │   ├── items/       #   CRUD for content_items
│   │   │   ├── links/       #   POST typed links
│   │   │   ├── search/      #   GET FTS5 + filtered search
│   │   │   ├── tags/        #   CRUD for tags
│   │   │   └── images/      #   GET stored images (path-traversal-safe)
│   │   ├── browse/          # Main feed / browse page
│   │   ├── chat/            # Web chat interface (/chat)
│   │   ├── graph/           # Knowledge graph view
│   │   ├── login/           # Login page
│   │   ├── settings/        # Settings page
│   │   ├── tags/            # Tag management page
│   │   ├── layout.tsx       # Root layout (fonts, metadata)
│   │   └── page.tsx         # Home page
│   ├── components/          # React components
│   │   ├── ui/              #   shadcn/ui primitives (button, input, …)
│   │   ├── layout/          #   Top nav, footer
│   │   └── command-palette/ #   Cmd+K command palette (cmdk)
│   ├── db/                  # Database layer
│   │   ├── client.ts        #   Connection management (caching, WAL, ext)
│   │   ├── index.ts         #   Barrel re-exports
│   │   ├── search.ts        #   FTS5 full-text search helpers
│   │   ├── vectors.ts       #   sqlite-vec vector search helpers
│   │   ├── seed-settings.ts #   Syncs env vars → settings table
│   │   ├── repositories/    #   Query helpers per table
│   │   ├── migrations/      #   SQL migration files (numbered)
│   │   └── test-utils.ts    #   Test DB helpers (create, reset, seed)
│   ├── lib/                 # Server-side utilities
│   │   ├── api.ts           #   Shared API helpers (pagination, errors)
│   │   ├── auth/            #   Session auth, CSRF, rate limiting
│   │   ├── env.ts           #   Zod-validated environment variables
│   │   ├── logger.ts        #   Structured logger
│   │   ├── rate-limit.ts    #   Global rate-limit enforcement (3 buckets)
│   │   ├── security.config.ts # Single source of truth for security headers
│   │   ├── ssrf.ts          #   SSRF protection for URL fetches
│   │   ├── storage.ts       #   Image storage + path-traversal guard
│   │   ├── metadata-fetcher.ts # Bookmark og:title/description fetcher
│   │   └── markdown-importer.ts # Markdown → content_items import
│   ├── hooks/               # Custom React hooks
│   ├── proxy.ts             # Next.js middleware (auth, CSRF, rate limit, headers)
│   └── test/                # Test setup (jest-dom matchers, jsdom polyfills)
├── scripts/                 # CLI scripts (setup-db, hash-password, import, …)
├── docs/                    # Documentation (this file + design specs)
├── data/                    # SQLite databases + uploaded images (gitignored)
├── docker-compose.yml       # Production deployment (app + nginx)
├── Dockerfile               # Multi-stage build (builds sqlite-vec)
├── nginx.conf               # Reverse proxy config
└── .env.template            # Environment variable template
```

---

## Key entry points

### Request lifecycle

Every HTTP request flows through this pipeline:

```
Request → proxy.ts → rate limit → auth check → CSRF check → route handler → response
                          ↓                                    ↓
                     security headers (applied on every response)
```

1. **`src/proxy.ts`** — Next.js middleware (renamed to `proxy` in
   Next 16+). The enforcement layer for auth, CSRF, rate limiting, and
   security response headers. Runs on every non-static route.
2. **Route handler** (`src/app/api/*/route.ts`) — handles the business
   logic. Each handler also calls `requireAuthenticated(request)` as
   defense in depth, so a unit test bypassing the proxy still fails
   closed.

### Database access

```
getDb()                    # src/db/client.ts — cached connection + migrations
  → contentItems           # src/db/repositories/content-items.ts
  → contentLinks           # src/db/repositories/content-links.ts
  → tags / contentTags     # src/db/repositories/tags.ts
  → search                 # src/db/search.ts (FTS5)
  → vectors                # src/db/vectors.ts (sqlite-vec)
  → auditLogs              # src/db/repositories/audit-logs.ts
  → settings               # src/db/repositories/settings.ts
```

All repositories are re-exported from `src/db/index.ts`. Import from
there:

```ts
import { getDb, contentItems, search } from "@/db/index";
```

---

## Architectural patterns

### Two-layer auth (proxy + route guard)

Auth is enforced at **two independent layers**:

- **Proxy** (`src/proxy.ts`) — the authoritative layer. Protects every
  route except `/login` and `/api/auth/*`. Redirects unauthenticated
  browser navigations to `/login?from=…`; returns 401 for unauthenticated
  API calls.
- **Route guard** (`src/lib/auth/guard.ts`) — `requireAuthenticated(request)`
  is called at the top of every protected route handler. This catches
  tests that invoke the handler directly (bypassing the proxy).

This means: **never remove the `requireAuthenticated` call** from a route
handler, even though the proxy already checks — it's defense in depth.

### Repository pattern

Database access is organized into repository objects (e.g.,
`contentItems`, `tags`, `search`). Each repository is a plain object of
functions that take a `Database` connection as their first argument:

```ts
const item = contentItems.findById(db, id);
```

This keeps SQL in one place and makes queries testable — tests pass a
fresh test database to the same functions.

### Zod validation at the boundary

Every API route validates input with a Zod schema defined alongside the
route handler (not in a separate file). The shared helper
`parseJson(schema, body)` from `src/lib/api.ts` returns a
`{ success, data | details }` discriminated union:

```ts
const parsed = parseJson(createSchema, body);
if (!parsed.success) {
  return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
    issues: parsed.details,
  });
}
```

### Two-level visibility (`is_hidden` / `is_private`)

Every read helper in `src/db/repositories/content-items.ts` and
`src/db/search.ts` takes `includeHidden` / `includePrivate` options
(both default to `false`). Rows with a set flag are excluded unless the
matching opt-in is passed. The opt-in is gated behind authentication at
the route layer — see [AGENTS.md > Two-level visibility](../AGENTS.md#two-level-visibility-issue-54).

### Error handling

- Route handlers catch errors and return generic messages to clients
  via `errorResponse(code, message, status)`.
- Detailed errors are logged server-side via `logServerError(error,
context)` from `src/lib/api.ts`.
- Security failures (401, 403, 429) return generic messages — never
  echo internal paths, DB errors, or stack traces.

### Structured logging

Use `log(level, message, context)` from `src/lib/logger.ts`. Events
include a short `event` key (e.g., `"content_item.create"`) for
filtering. Debug logs are suppressed in production.

### Security configuration in one place

All security policy — response headers (CSP, HSTS, X-Frame-Options, …),
rate-limit thresholds, SSRF limits, CORS posture — lives in
`src/lib/security.config.ts`. Do not set security headers from route
handlers, `next.config.ts`, or ad-hoc `headers.append` calls.

---

## Path alias

The `@/` alias maps to `src/`:

```ts
import { getDb } from "@/db/index";
import type { ContentItem } from "@/db/schema";
import { requireAuthenticated } from "@/lib/auth/guard";
```

This is configured in both `tsconfig.json` and `vitest.config.ts`.

---

## Component architecture

- **Server components** (default) — fast initial loads, direct DB access.
- **Client components** (`"use client"`) — interactive features (forms,
  command palette, graph view). Marked with the `"use client"` directive.
- **shadcn/ui** (`src/components/ui/`) — the component library. Built on
  Tailwind CSS. Components are added via `pnpm dlx shadcn add <name>`.

---

## Scripts

CLI utilities live in `scripts/`:

| Script                       | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| `setup-db.js`                | Create/reset database for a given env            |
| `hash-password.ts`           | Generate a bcrypt hash for `ADMIN_PASSWORD_HASH` |
| `import-markdown.ts`         | Import Markdown files as content_items           |
| `migrate-journal-shadows.ts` | Migrate from legacy journal-shadows DB           |
| `build-sqlite-vec.sh`        | Build the sqlite-vec C extension                 |
| `codeql-scan.sh`             | Run CodeQL security queries locally              |
| `test-db-reset.js`           | Reset test database                              |
| `test-db-cleanup.js`         | Clean up test database                           |

Run TypeScript scripts with `tsx`:

```bash
pnpm hash:password
pnpm import:markdown
```
