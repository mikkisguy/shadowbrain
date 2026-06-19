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
```

## Security Scanning (CodeQL)

**Policy:** When fixing a CodeQL / code-scanning alert (taint-flow queries like
`request-forgery`, `sql-injection`, `prototype-pollution`, etc.), **verify the
fix with the local CodeQL analyzer** before claiming success. Do not reason
about what the analyzer models as a sanitizer/sink — run the query and get
ground truth. For ordinary bugs, lint, typecheck, or feature work, use
`pnpm test` / `typecheck` / `lint` instead — CodeQL is heavy (~30 s DB build
+ query eval) and wasteful for non-CodeQL problems.

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

## Backend Guidelines

### Database

- Use `better-sqlite3` synchronously for reads, async wrappers for API routes
- Write migrations as SQL files in `src/db/migrations/`
- **Don't edit applied migrations** — add a new one. The migration history is the audit trail (especially under the App Security Baseline: it records every schema change).
- Open connections briefly; close after each operation
- WAL mode enabled for concurrent access

### Validation

- Use Zod schemas for all API input validation
- Define schemas alongside route handlers, not in a separate file

### Error Handling

- Return proper HTTP status codes
- Log detailed errors server-side; return generic messages to clients
- Security failures (401, 403, 429) must return generic messages to the client; the specific reason is logged server-side and to `audit_logs` — never echo internal paths, DB errors, or stack traces
- See `docs/superpowers/specs/2026-06-19-app-security-baseline-design.md` §Error Handling for the full policy

### Rate Limiting

- **Required** for auth endpoints (`/api/auth/login`) — ≈5 attempts / 15 min / IP, enforced by the session module from #53.
- **Required** for all other API routes — ≈120 req / min / IP.
- **Required** for non-API routes — ≈600 req / min / IP.
- Implemented in `src/lib/rate-limit.ts` (in-memory token bucket per IP) by **#56 — Security: global rate limiting**. Reads the real client IP from the configured trusted proxy header (`X-Forwarded-For` / `X-Real-IP`).
- Returns `429` with `Retry-After` on exceed.

### Performance

- Use `Promise.all()` for parallel independent operations
- Avoid N+1 queries — batch where possible

## Frontend Guidelines

- Use shadcn/ui components (built on Tailwind CSS)
- Lucide React for icons
- Dark mode is the default theme
- TanStack Query for server state if complexity warrants it, otherwise fetch + SWR

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at repo root. See `docs/agents/domain.md`.
