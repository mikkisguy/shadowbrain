# Vision & Design Principles

## The Vision

ShadowBrain is a **personal knowledge graph** disguised as a journal. It captures every thought — fleeting ideas, daily reflections, research notes, bookmarks, project plans, and questions — and weaves them into a searchable, browsable, AI-assisted network.

Most knowledge tools force a choice:
- **Notion/Obsidian**: Great for notes, weak for structured journaling
- **Day One/Journey**: Great for journaling, weak for knowledge management
- **Pinboard/Raindrop**: Great for bookmarks, disconnected from everything else

ShadowBrain says: **one database, every thought type, all connected.**

## Design Principles

### 1. Frictionless Capture (< 3 seconds)

If capturing a thought takes more than 3 seconds, it won't happen. Every interaction method — Discord message, web form, voice note, email forward — must be instant.

### 2. Local-First, Portable Forever

The database is a single SQLite file. Backup with `cp`. Migrate with `scp`. Export to Markdown, JSON, or CSV at any time. No vendor lock-in. No cloud dependency.

### 3. Hermes is the Primary Interface

The web UI is beautiful and full-featured, but the *primary* interaction model is natural language through Hermes. "Save this thought." "What was I working on last Tuesday?" "Find notes similar to this one." Hermes is the voice of ShadowBrain.

### 4. Everything Connects

Not just "tags" or "folders" — typed, bidirectional links with semantics. A bookmark can reference a project. A journal entry can contradict a note. A question can be answered by a person. The graph is the value.

### 5. Privacy by Design

All data lives on your server. AI features use your OpenRouter API key — no third-party access to your data. Optional cloud sync is end-to-end encrypted, never mandatory.

### 6. Premium Feel

Fast page loads. Beautiful typography. Dark mode by default. Thoughtful animations that feel deliberate, not decorative. Every interaction polished.

### 7. Composable API

The backend exposes a clean REST API. Build your own tools on top. Automate capture via webhooks. ShadowBrain is a platform, not a walled garden.

### 8. Longevity

This system should outlive any single app. The database schema is designed for decades. Exports are standard formats. Markdown is always available. No proprietary formats, ever.
