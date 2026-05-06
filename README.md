# ShadowBrain

**Your second brain. Frictionless. Connected. Yours forever.**

ShadowBrain is a personal knowledge management system that treats every thought — raw captures, journal entries, knowledge notes, bookmarks, people, projects, questions, and events — as nodes in a rich, typed graph. Everything connects. Nothing gets lost.

---

## What Makes It Different

- **Everything in one database** — no split between "journal here" and "notes there." One query across your entire brain.
- **Semantic search** — find thoughts by *meaning*, not just keywords.
- **Typed links** — `inspired by`, `contradicts`, `builds upon`, `involves`, `bookmarked for` — not just "related to."
- **Frictionless capture** — Discord, web, voice. Under 3 seconds from thought to saved.
- **Hermes is the interface** — your AI assistant is the primary interaction layer. Talk to it like a person.
- **Local-first, portable forever** — SQLite database. One file. Copy it anywhere. Export everything to Markdown.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Database** | SQLite + `sqlite-vec` (semantic search) + FTS5 (full-text) |
| **Backend** | Next.js (App Router, TypeScript) |
| **Frontend** | React 19 + Tailwind CSS + shadcn/ui |
| **AI Interface** | Hermes Agent (primary user layer) |
| **Capture** | Discord WebSocket listener, Web UI, API |
| **AI Processing** | OpenRouter (configurable model) |
| **Deployment** | Docker Compose + nginx reverse proxy |

---

## Documentation

- [Vision & Design Principles](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Database Schema](docs/schema.md)
- [Feature Catalog](docs/features.md)
- [Interaction Methods](docs/interaction-methods.md)
- [Hermes Integration](docs/hermes-integration.md)
- [Implementation Phases](docs/phases.md)
