# Feature Catalog

Derived from the architecture vision and user requirements. Organized by layer.

---

## 1. Capture Layer

*Friction kills capture. Everything here is < 3 seconds from thought to saved.*

| Feature | Priority | Description |
|---------|----------|-------------|
| **Discord quick capture** | P0 | Post in #journal thread → instantly saved. No commands needed. |
| **Discord image capture** | P0 | Paste/send images → auto-downloaded, converted to WebP, saved. |
| **Web UI quick add** | P0 | Textarea + type selector + submit. Ctrl+Enter to save. |
| **Web UI bookmark add** | P1 | Paste URL → auto-fetch title, description, favicon. One click save. |
| **Hermes voice capture** | P1 | "Save this: need to update the SSL cert before Friday" |
| **Email-to-inbox** | P2 | Forward emails to a private address → saved as raw entries |
| **API / webhook ingest** | P2 | `POST /api/items` — build your own capture tools |
| **Mobile-optimized PWA** | P2 | Add to home screen, quick capture widget |
| **Browser extension** | P3 | One-click bookmark save with tags |
| **Auto-tagging on intake** | P1 | LLM suggests tags based on content (opt-in, reviewable) |
| **Source preservation** | P0 | Every item records: source (discord/web/api), original URL, timestamp |

---

## 2. Retrieval & Discovery

*You wrote it. Can you find it?*

| Feature | Priority | Description |
|---------|----------|-------------|
| **Full-text search (FTS5)** | P0 | Keyword search across all content with ranking |
| **Semantic search** | P1 | "Find notes similar in meaning to this one" via `sqlite-vec` |
| **Hybrid search** | P2 | Combine FTS + semantic results with configurable weights |
| **Filter by type** | P0 | Show only notes, only bookmarks, only journal entries |
| **Filter by tag** | P1 | Multi-select tag filter |
| **Filter by date range** | P1 | "What was I thinking about in May 2024?" |
| **Filter by person/project** | P2 | "Show everything connected to Project X" |
| **Graph traversal** | P2 | "Show everything within 2 hops of this note" |
| **"On this day" resurfacing** | P2 | Daily recap of past entries from this date |
| **Random / serendipity mode** | P3 | Random walk through your graph for rediscovery |
| **Orphan detection** | P2 | Flag notes with zero connections, suggest links |
| **Conceptual clustering** | P3 | "These 5 notes from different months are really about the same idea" |

---

## 3. Synthesis & Sensemaking

*AI helps you think across your own data.*

| Feature | Priority | Description |
|---------|----------|-------------|
| **Nightly journal compilation** | P0 | Raw entries → AI-compiled daily summary (migrated from journal-shadows) |
| **Auto title generation** | P0 | LLM suggests titles for journal entries and notes |
| **Auto-generated MOCs** | P2 | System suggests index notes based on content clusters |
| **Contradiction detection** | P3 | "You believe X here but argued Y there — reconcile?" |
| **Gap analysis** | P3 | "You've written a lot about A but almost nothing about B" |
| **Timeline view** | P2 | See how an idea evolved across entries over time |
| **AI-assisted synthesis** | P2 | "Summarize everything I've written about topic Z" |

---

## 4. Journal-Specific

| Feature | Priority | Description |
|---------|----------|-------------|
| **4 AM boundary** | P0 | Day runs 4 AM to 4 AM (from journal-shadows) |
| **Period-based compilation** | P0 | Dynamic generation windows, not strict daily boundaries |
| **Mood tracking** | P2 | Optional structured fields: mood, energy, focus |
| **Prompt engine** | P2 | Daily/weekly/monthly reflection prompts |
| **Dream journal mode** | P3 | Specialized capture for dreams |
| **Private/sensitive flag** | P1 | Entries never surfaced in AI queries or public views |

---

## 5. Output & Action

*Knowledge is inert unless it does something.*

| Feature | Priority | Description |
|---------|----------|-------------|
| **Markdown export** | P1 | Export any item or collection as .md files |
| **Full database export** | P1 | Export all content as JSON, CSV, or Markdown |
| **Project scaffolding** | P3 | Select a cluster → generate project plan from connected notes |
| **Share / publish** | P3 | Generate a shareable view of a curated subset |

---

## 6. Web UI

*Beautiful, efficient, premium feel.*

| Feature | Priority | Description |
|---------|----------|-------------|
| **Unified browse feed** | P0 | All content types in one infinite-scroll feed |
| **Type filter tabs** | P0 | Quick toggle: All / Notes / Journal / Bookmarks |
| **Search bar** | P0 | FTS5-backed with debounce, results as you type |
| **Item detail page** | P0 | Full content rendered as Markdown, tags, links, metadata |
| **Graph visualization** | P2 | Force-directed graph of links, clickable nodes |
| **Tag management page** | P1 | CRUD tags, merge, see usage counts |
| **Settings page** | P1 | AI model config, API keys, export settings |
| **Dark mode (default)** | P0 | Proper dark palette, not inverted hack |
| **Responsive design** | P1 | Works on mobile, tablet, desktop |
| **shadcn/ui components** | P0 | Consistent, premium component library |

---

## 7. Hermes Integration

*I am the voice of ShadowBrain.*

| Feature | Priority | Description |
|---------|----------|-------------|
| **Natural language capture** | P0 | "Save this thought" → saved with auto-type detection |
| **Context queries** | P0 | "What was I working on last week?" — cross-content search |
| **Journal queries** | P0 | "Show me yesterday's journal entry" |
| **Semantic queries** | P2 | "Find notes similar to this idea" |
| **Graph queries** | P2 | "What's connected to Project X?" |
| **Auto-tagging suggestions** | P2 | When capturing, Hermes suggests relevant tags |
| **System health** | P2 | "How many orphan notes do I have?" |

---

## 8. Meta Layer

| Feature | Priority | Description |
|---------|----------|-------------|
| **Usage analytics** | P3 | What do you capture most? What tags grow fastest? |
| **System health dashboard** | P3 | Broken links, orphan nodes, stale content |
| **Evolving tag taxonomy** | P3 | System suggests new categories as patterns emerge |
| **Backup reminders** | P3 | Periodic nudge to back up the database |

---

## Priority Legend

| Level | Meaning |
|-------|---------|
| **P0** | Must have for Phase 1 launch |
| **P1** | Phase 2 — important, builds on P0 |
| **P2** | Phase 3 — makes it great |
| **P3** | Phase 4+ — nice to have, future roadmap |
