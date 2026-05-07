# ShadowBrain

Personal knowledge graph + journal, local-first, with Hermes (Nous Research's autonomous AI agent) as the primary interface via Discord.

## Quick start

pnpm dev      # Start dev server
pnpm test     # Run tests
pnpm lint     # Lint

## Key docs

- **docs/vision.md** — What this is and why
- **docs/architecture.md** — System design (SQLite + Next.js + Discord listener)
- **docs/hermes-integration.md** — How Hermes connects
- **docs/schema.md** — Data model
- **docs/phases.md** — Implementation roadmap
- **AGENTS.md** — Technical reference for agents (commands, code style)

## Domain language

- "entry" = any thought captured (journal, note, bookmark, question)
- "Hermes" = Nous Research's autonomous, self-improving AI agent (Discord interface)
- "link" = typed, bidirectional connection between entries

## Agent skills

See `AGENTS.md → ## Agent skills` for issue tracker, triage labels, and domain docs config.
