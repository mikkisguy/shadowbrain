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

## Frontend Guidelines

- Use shadcn/ui components (built on Tailwind CSS)
- Dark mode is the default theme
- TanStack Query for server state if complexity warrants it, otherwise fetch + SWR

## Review Checklist

Before opening a PR, walk through this checklist. It is intentionally
short — the goal is "did I think about the obvious things", not exhaustive
review (that is the deterministic chain in `pnpm verify` and, for
sensitive changes, the `@oracle` review pass described in the Pull
Request Workflow below).

**Scope and shape**

- The diff is scoped to one issue. If scope grew, split it into a
  follow-up instead of mixing.
- No drive-by formatting churn unrelated to the change (run
  `pnpm format` and commit only what is necessary).
- No commented-out code, debug `console.log`s, or `TODO` left behind.

**Correctness**

- New behavior has at least one test. Bug fixes include a regression
  test that fails before the fix.
- Schema changes ship a new SQL migration in `src/db/migrations/`
  (never edit an applied migration — see Backend Guidelines).
- API changes have Zod schemas for input validation defined
  alongside the route handler.

**Security and policy**

- No secrets, tokens, or `.env` values in the diff. Confirm
  `git diff` output before committing.
- Security failures (401 / 403 / 429) return generic messages to the
  client; specific reasons are logged server-side and to
  `audit_logs`. See Backend Guidelines §Error Handling.
- New endpoints respect the rate-limit policy: auth endpoints
  ≈5 attempts / 15 min / IP, other API routes ≈120 req / min / IP,
  non-API routes ≈600 req / min / IP. See Backend Guidelines
  §Rate Limiting.

**Docs**

- `AGENTS.md` updated if a new convention, command, or workflow
  step was introduced.
- `CONTEXT.md` updated if a domain concept, table, or invariant
  changed.
- `docs/superpowers/specs/*.md` updated if a security,
  architectural, or removal-of-documented-API decision shifted.
- `package.json` `version` bumped per the [Versioning](#versioning)
  rules when the change adds, removes, or alters user-facing
  behavior.

## Pull Request Workflow

**Default flow for triaged issues: start on a fresh branch from `main`.**
When you begin work on a triaged issue, do not commit on whatever
branch is currently checked out. Instead:

1. `git checkout main`
2. `git pull origin main` (or `git pull` if `main` already tracks
   `origin/main`)
3. Create a branch named after the issue, e.g. `issue/<#>-<slug>`
   (e.g. `issue/123-rate-limit-auth`).
4. Implement the issue on that branch.

**Exception: in-place fixes on an existing PR.** If a PR is already
open for the work — including subsequent review iterations on the
same issue (checklist fixes, `@oracle` findings, CI failures) — push
to the same branch and PR. "Scope discipline" means "do not mix
unrelated changes into a PR" — it does not mean "always split
ad-hoc fixes into a new branch and PR." Only create a new branch
and PR when the developer explicitly says so, or when the work is
for a separate, distinct issue that has been triaged in the issue
tracker.

When the issue assigned to you is implemented and locally verified
(`pnpm verify` is green), take the work through to a PR that is green
and ready for human review. Use the `gh` CLI for all GitHub
interactions. **Never merge the PR yourself — merging is a developer
decision.**

**Flow:**

1. **Self-review with the checklist above.** Walk through
   `## Review Checklist`. Fix anything you find before committing.
2. **Sensitive or high-risk diffs: delegate to `@oracle` before
   opening the PR.** Use the `@oracle` specialist for a strategic +
   security review pass if **any** of the following is true:
   - The diff touches auth, sessions, rate limiting, secrets, or
     security boundaries.
   - The diff touches the database layer (schema, migrations,
     query helpers, audit log).
   - The diff adds or changes an API route, route handler, or
     proxy.
   - The diff is large (rule of thumb: > 200 changed lines, or any
     single file > 100 changed lines).
   - You are uncertain about an architectural choice.

   Documentation-only changes (typo fixes, formatting, doc rewording
   with no security or architectural impact) are exempt from the size
   and category triggers above — only route to `@oracle` if the doc
   change is itself a security/architectural decision.

   Pass to `@oracle`: the issue reference, the full diff, the list of
   files touched, and a one-line description of intent. Address every
   `must-fix` and `should-fix` finding on the branch, then re-delegate
   to `@oracle` with the updated diff. **Loop until `@oracle` reports
   no remaining must-fix or should-fix findings** — only then proceed
   to open the PR. Any item you intentionally defer must be called
   out in the PR body with a one-line justification; silently skipping
   a finding is not acceptable.

3. **Stage and commit** only the intended files. Inspect `git status`
   and `git diff` first; never commit secrets. Write a concise commit
   message that matches the repo style (look at recent
   `git log --oneline -10`).
4. **Push** the branch: `git push -u origin <branch>`.
5. **Open a PR** with `gh`:
   ```bash
   gh pr create \
     --base <base-branch> \
     --title "<short summary>" \
     --body "<issue reference + what changed + how it was verified + @oracle verdict if applicable>"
   ```
   Reference the issue (`Closes #N` or `Fixes #N`) in the body so
   merging the PR closes the issue.
6. **Watch status checks**: `gh pr checks --watch` (or poll with
   `gh pr view <pr> --json statusCheckRollup`). If a check fails, read
   the logs, fix the underlying cause on the branch, commit, push, and
   re-watch. Keep iterating until all required checks are green.
7. **Stop and hand off** when checks are green. Do not run
   `gh pr merge`, do not enable auto-merge, do not dismiss reviews. The
   developer reviews and merges.

**Constraints:**

- One PR per issue, scoped tightly. If scope grows, split it into a
  follow-up.
- If a check looks flaky or transient, rerun it
  (`gh pr checks <id> --rerun`) only after confirming the failure is
  not caused by your change.
- Do not force-push after a review has started unless explicitly asked.
- If you are blocked by something only a human can resolve (missing
  credentials, protected-branch permissions, ambiguous requirements),
  stop and report the blocker instead of guessing.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at repo root. See `docs/agents/domain.md`.
