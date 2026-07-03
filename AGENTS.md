# AGENTS.md

This file is the authoritative technical reference for agentic coding assistants
working on ShadowBrain. Follow these guidelines exactly.

## Development Commands

```bash
# Start dev server
pnpm dev

# Build for production
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint
pnpm lint

# Format all code
pnpm format

# Type check
pnpm typecheck

# Run the full verify chain (lint → typecheck → build → test → knip)
# This is the local "all green" bar for opening a PR.
pnpm verify
```

## Security Scanning (CodeQL)

**Policy:** When fixing a CodeQL / code-scanning alert (taint-flow queries like
`request-forgery`, `sql-injection`, `prototype-pollution`, etc.), **verify the
fix with the local CodeQL analyzer** before claiming success. Do not reason
about what the analyzer models as a sanitizer/sink — run the query and get
ground truth. For ordinary bugs, lint, typecheck, or feature work, use
`pnpm test` / `typecheck` / `lint` instead — CodeQL is heavy (~30 s DB build

- query eval) and wasteful for non-CodeQL problems.

**Usage:**

```bash
# Default: run js/request-forgery query
./scripts/codeql-scan.sh

# Explicit rule alias
./scripts/codeql-scan.sh request-forgery

# Full javascript-code-scanning suite (87 queries, what GitHub Actions runs)
./scripts/codeql-scan.sh full

# Arbitrary query/suite file
./scripts/codeql-scan.sh path/to/Query.ql
```

**Exit codes:** `0` = no alerts (clean) · `2` = alerts found · `1` = setup/usage error.

**Bootstrap install** (one-time, if `~/.local/share/codeql-cli/codeql` is missing):

```bash
mkdir -p ~/.local/share/codeql-cli
curl -sL -o /tmp/codeql.tar.gz \
  https://github.com/github/codeql-action/releases/latest/download/codeql-bundle-linux64.tar.gz
tar xzf /tmp/codeql.tar.gz -C ~/.local/share/codeql-cli
# -> creates ~/.local/share/codeql-cli/codeql/codeql
```

The script prints these instructions automatically if the CLI is absent.

> The local scan script (`scripts/codeql-scan.sh`) is set up by **#61 — Security:
> CI guardrails (CodeQL, lint CI, Renovate, SECURITY.md)**. Until that issue
> lands, the script path above is the contract the implementation must create
> (exit codes, usage, bootstrap instructions must all match this section).

## E2E Testing (Playwright)

The e2e suite uses Playwright against a dedicated `NODE_ENV=e2e` environment
that runs on port 3011 with an isolated SQLite database (`data/shadowbrain.e2e.db`).
Auth, CSRF, and rate limiting are bypassed in e2e mode — tests do not need to
log in or manage session cookies.

### How it works

- `src/proxy.ts`: when `NODE_ENV === "e2e"`, all requests pass through without
  auth/CSRF/rate-limit checks (the security headers — CSP, HSTS, etc. — still
  apply so CSP-related regressions are caught).
- `src/lib/auth/guard.ts`: `requireAuthenticated()` returns `{ ok: true }` in
  e2e mode, so every API route handler accepts requests without credentials.
- `src/db/client.ts`: `getDbPath()` resolves to `data/shadowbrain.e2e.db` when
  `NODE_ENV === "e2e"` — fully isolated from your dev DB.
- `src/lib/env.ts`: the Zod schema accepts `"e2e"` as a valid `NODE_ENV`.

### Commands

```bash
# Start the e2e dev server (port 3011, separate DB)
pnpm dev:e2e

# Set up / migrate the e2e database (auto-migrates on first server start too)
pnpm setup:e2e

# Run e2e tests (starts the server automatically via webServer config)
pnpm test:e2e

# Run e2e tests with Playwright UI mode
pnpm test:e2e:ui

# Run e2e tests in debug mode (step through, see DevTools)
pnpm test:e2e:debug
```

### Test structure

Tests live in `e2e/` at the project root. They are not part of the app
build — `tsconfig.json` excludes the directory and the root typecheck
(`pnpm typecheck`) does not cover them.

```
e2e/
├── *.setup.ts    # Seed data before tests (runs first via project dependency)
├── *.spec.ts     # Actual test files
└── tsconfig.json # Extends root, adds @playwright/test types
```

The **setup project** (`e2e/seed.setup.ts`) runs before all spec files
and populates the e2e database with test data via the API. Add new seed
data there when you need pre-existing content for your tests.

### Writing e2e tests

Use the standard Playwright API. Since auth is bypassed, you can navigate
to any page or call any API route directly:

```ts
import { test, expect } from "@playwright/test";

test("browse page shows seeded items", async ({ page }) => {
  await page.goto("/browse");
  await expect(page.getByText("Welcome to ShadowBrain")).toBeVisible();
});
```

For API-only tests, use `request`:

```ts
test("GET /api/items works", async ({ request }) => {
  const res = await request.get("/api/items");
  expect(res.ok()).toBeTruthy();
});
```

### When to use e2e vs vitest

| Concern                           | vitest (unit/integration) | Playwright (e2e)      |
| --------------------------------- | ------------------------- | --------------------- |
| Route handler logic               | ✅ Faster, no browser     | ❌                    |
| DB queries                        | ✅ Direct DB access       | ❌                    |
| Auth / guard behavior             | ✅ `createAuthedRequest`  | ❌ (bypassed)         |
| Browser rendering                 | ❌ jsdom (partial)        | ✅ Real Chromium      |
| CSP / security headers            | ✅ Unit-tested            | ✅ Integration-tested |
| Page navigation                   | ❌                        | ✅                    |
| User interactions (clicks, forms) | ❌                        | ✅                    |
| AI agent: "does my feature work?" | ❌                        | ✅ Best fit           |

## Project Structure

ShadowBrain is a single Next.js (App Router) application — not a monorepo.

```
src/
├── app/             # Next.js App Router pages and API routes
├── db/              # Database layer (better-sqlite3 + schema)
│   ├── schema.ts    # Table definitions
│   ├── migrations/  # SQL migration files
│   └── index.ts     # Query helpers
├── lib/             # Utilities (auth, storage, ai prompts)
├── components/      # React components (shadcn/ui based)
├── hooks/           # Custom React hooks
└── test/            # Test setup and helpers
```

## Code Style

### Imports

- Use `@/` alias for src: `import { getItem } from "@/db/index"`
- Type-only imports: `import type { ContentItem } from "@/db/schema"`
- Order: builtins → external → internal → types

### TypeScript

- Strict mode enabled
- Use `type` keyword (unions), not `enum`
- Never use `as any` — create type guards
- Schema types inferred from table definitions
- For Zod schemas, use `z.infer<typeof schema>` for the TypeScript type; do not duplicate the shape as a hand-written interface

### Naming

- Files: kebab-case (`error-handler.ts`), PascalCase for components
- Functions: camelCase
- Types/Interfaces: PascalCase
- Constants: `UPPER_SNAKE_CASE` for global values (API base URLs, retry limits, error codes). `camelCase` for config objects, theme values, and module-level defaults.

### Formatting (Prettier)

- Semicolons: yes
- Quotes: double
- Trailing commas: es5
- Print width: 80
- Indent: 2 spaces (no tabs)
- Arrow parens: always
- End of line: lf

## Versioning

`package.json` carries the app's `major.minor.patch` version. The project is
pre-1.0 (`0.x.y`) — **major is not yet**, so API stability is not promised.

Bump the version in `package.json` on the same branch as the change when it is
relevant:

- **patch** (`0.2.x → 0.2.y`) — bug fixes, internal refactors, dependency
  bumps, and other changes with no user-visible behavior change.
- **minor** (`0.x.0`) — any new user-facing feature, new API endpoint, new UI
  surface, or other meaningful capability that adds something a user can see
  or call.
- **major** (`x.0.0`) — reserved for the first stable release. Do not bump
  major until the API surface and data model are considered stable.

- **Patch the README badge too.** `package.json` and the shields.io version
  badge in `README.md` (the `[![Version](...)]` line in the header) must be
  bumped in lockstep — a version bump that leaves the badge stale is a
  half-applied change.

When in doubt, bump minor — under `0.x` it is cheap to add more, and the
version is meant to be a rough signal of how much capability has landed, not
a contract.

## Backend Guidelines

### Database

- Use `better-sqlite3` synchronously for reads, async wrappers for API routes
- Write migrations as SQL files in `src/db/migrations/`
- **Don't edit applied migrations** — add a new one. The migration history is the audit trail (especially under the App Security Baseline: it records every schema change).
- Open connections briefly; close after each operation
- WAL mode enabled for concurrent access

### Two-level visibility (issue #54)

`content_items` carries two independent visibility flags — `is_hidden`
and `is_private` — both defaulting to `0` (visible). The read helpers
in `src/db/repositories/content-items.ts` and `src/db/search.ts` take
`includeHidden` / `includePrivate` options (both default to `false`)
and hide any row whose flag is set without the matching opt-in. A row
with _both_ flags set requires _both_ opt-ins to be returned.

The opt-ins are gated behind authentication at the route layer
(`requireAuthenticated(request)` from `src/lib/auth/guard.ts`): the
admin can opt in via `?include_hidden=1` / `?include_private=1` on
`GET /api/items`, `GET /api/items/[id]`, `GET /api/search`,
`PATCH /api/items/[id]`, and `DELETE /api/items/[id]`. The body of
`POST /api/items` and `PATCH /api/items/[id]` accepts an
`is_hidden` / `is_private` field (admin-only). An unauthenticated
request always sees the strict default and the route returns 401 —
the opt-in cannot be used to bypass auth.

### Validation

- Use Zod schemas for all API input validation
- Define schemas alongside route handlers, not in a separate file

### Error Handling

- Return proper HTTP status codes
- Log detailed errors server-side; return generic messages to clients
- Security failures (401, 403, 429) must return generic messages to the client; the specific reason is logged server-side and to `audit_logs` — never echo internal paths, DB errors, or stack traces
- See `docs/superpowers/specs/2026-06-19-app-security-baseline-design.md` §Error Handling for the full policy

### Rate Limiting

- **Required** for auth endpoints (`/api/auth/login`) — ≈5 attempts / 15 min / IP.
- **Required** for all other API routes — ≈120 req / min / IP.
- **Required** for non-API routes — ≈600 req / min / IP.
- Implemented in `src/lib/rate-limit.ts` (in-memory token bucket per IP) by **#56 — Security: global rate limiting**. The proxy (`src/proxy.ts`) is the enforcement layer: it picks the right bucket per path, consumes a token, and returns 429 + `Retry-After` before the request reaches the route handler. Route handlers do not consume tokens of their own — the login route only calls `resetLoginRateLimit(ip)` on a successful login so a legitimate user is not penalised for typos.
- Reads the real client IP from the configured trusted proxy header. The header name is the `TRUSTED_PROXY_HEADER` env var (default `X-Forwarded-For`; nginx typically sets it via `proxy_set_header X-Forwarded-For $remote_addr;`). When the configured header is missing, the IP falls back to `"unknown"` and every request lands in the same bucket — that is a deployment problem (no trusted proxy), not a code bug.
- Returns `429` with `Retry-After` on exceed. The 429 response is generic (no internal paths, no DB errors) and carries the same security response headers (CSP, HSTS, …) as every other code path; see the App Security Baseline design spec §Error Handling.

### Auth (session-based, single-user)

The session-auth foundation lives in `src/lib/auth/` and is enforced at two layers:

- **Proxy (`src/proxy.ts`)** — Next.js's renamed `middleware` (Next 16+). Protects every route except `/login` and `/api/auth/*`; checks the CSRF origin on state-changing methods; redirects unauthenticated browser navigations to `/login?from=…` and returns 401 for unauthenticated API calls. Sliding renewal re-signs the cookie on activity so `SESSION_MAX_AGE` also acts as an inactivity timeout.
- **Route guard (`src/lib/auth/guard.ts`)** — `requireAuthenticated(request)` is called at the top of every protected route handler as a defense-in-depth check; a unit test that invokes the handler without going through the proxy still fails closed.

Auth library modules: `session.ts` (HMAC-signed cookies, clamping, sliding renewal), `password.ts` (bcrypt + OWASP ASVS V3.2.2 constant-time login via a precomputed dummy hash), `csrf.ts` (origin/referer check, constant-time compare), `exempt-paths.ts` (exact-pathname matching — no suffix/prefix), `audit.ts` (auth event log to `audit_logs`), `client-ip.ts`, `constants.ts`.

Required env vars: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (bcrypt hash, cost ≥ 10), `SESSION_SECRET` (min 32 chars, used to sign cookies). `SESSION_MAX_AGE` is optional (ms; clamped to [1h, 30d]; default 24h). `TRUSTED_PROXY_HEADER` is optional (default `X-Forwarded-For`; the rate limiter and audit log read the client IP from this header — see `### Rate Limiting` above and the App Security Baseline design spec §5). Generate the password hash with `pnpm hash:password` — a hidden-prompt script in `scripts/hash-password.ts` that reuses the app's `bcryptjs` and `BCRYPT_COST` so the hash is guaranteed to verify against the login route.

Test helper: `authedRequest(url, init)` in `src/db/test-utils.ts` signs a session cookie using the test `SESSION_SECRET`, so existing route tests can call the protected handlers directly.

### Performance

- Use `Promise.all()` for parallel independent operations
- Avoid N+1 queries — batch where possible

### SSRF Protection

- All URL-fetch endpoints (bookmark auto-fetch, image capture) MUST use
  `validateFetchUrl` from `src/lib/ssrf.ts` before making any HTTP request.
- The validator blocks private / loopback / link-local IP ranges, rejects
  non-http(s) schemes, and returns a `safeLookup` callback that re-validates
  the IP at connect time to prevent DNS rebinding.
- See the App Security Baseline design spec
  (docs/superpowers/specs/2026-06-19-app-security-baseline-design.md §7)
  for the full policy.
- **Carve-out — admin-configured provider endpoints.** Chat-provider
  connections in `src/lib/settings/provider-connection.ts` (Hermes,
  OpenCode Go) intentionally do **not** use `validateFetchUrl`. The base
  URLs are operator-only settings saved through the authenticated settings
  route, and the defaults point at local services (e.g.
  `http://localhost:8642/v1`) that the private-range guard would block by
  design. These are trusted, admin-supplied destinations — not arbitrary
  user input — so the SSRF guard does not apply. Any new fetch of a URL
  that originates from an unauthenticated or non-admin source MUST still go
  through `validateFetchUrl`.

## Frontend Guidelines

- Use shadcn/ui components (built on Tailwind CSS)
- Dark mode is the default theme
- TanStack Query for server state if complexity warrants it, otherwise fetch + SWR

## Review Checklist

The pre-PR walkthrough lives in [`docs/agents/review-checklist.md`](docs/agents/review-checklist.md). Walk through it before opening a PR.

## Pull Request Workflow

The end-to-end flow for taking work to a green PR lives in [`docs/agents/pr-workflow.md`](docs/agents/pr-workflow.md).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at repo root. See `docs/agents/domain.md`.
