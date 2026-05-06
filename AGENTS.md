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

### Naming

- Files: kebab-case (`error-handler.ts`), PascalCase for components
- Functions: camelCase
- Types/Interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE for global values, camelCase for config

### Formatting (Prettier)

- Semicolons: yes
- Quotes: double
- Trailing commas: es5
- Print width: 80
- Indent: 2 spaces (no tabs)
- End of line: lf

## Backend Guidelines

### Database

- Use `better-sqlite3` synchronously for reads, async wrappers for API routes
- Write migrations as SQL files in `src/db/migrations/`
- Open connections briefly; close after each operation
- WAL mode enabled for concurrent access

### Validation

- Use Zod schemas for all API input validation
- Define schemas alongside route handlers, not in a separate file

### Error Handling

- Return proper HTTP status codes
- Log detailed errors server-side; return generic messages to clients

### Performance

- Use `Promise.all()` for parallel independent operations
- Avoid N+1 queries — batch where possible

## Frontend Guidelines

- Use shadcn/ui components (built on Tailwind CSS)
- Lucide React for icons
- Dark mode is the default theme
- TanStack Query for server state if complexity warrants it, otherwise fetch + SWR
