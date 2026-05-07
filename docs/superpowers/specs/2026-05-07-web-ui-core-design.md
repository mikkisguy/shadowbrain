# Phase 3: Web UI Core — Design Spec

**Date:** 2026-05-07
**Status:** Draft

---

## Overview

Phase 3 delivers the core web UI for ShadowBrain — a dark-mode, responsive interface for browsing, searching, and managing knowledge. While Hermes remains the primary interface, the web UI supports deep exploration, content management, and configuration.

---

## Navigation Structure

**Top navigation bar** with 5 sections:

- **Browse** (`/`) — Main feed with infinite scroll, search, and filters
- **Search** (`/search`) — Dedicated search page (can merge with Browse later)
- **Graph** (`/graph`) — Visual knowledge graph (placeholder for Phase 5)
- **Tags** (`/tags`) — Tag management
- **Settings** (`/settings`) — Configuration

Each section is its own page with clear URL structure. Full content width available below the nav.

---

## Browse Page (`/`)

### Layout

```
┌─────────────────────────────────────────────────────┐
│ ShadowBrain    Browse    Search    Graph    Tags    Settings │
├─────────────────────────────────────────────────────┤
│  Search input: "Search by keyword..."              │
│  Type: [All] [Notes] [Journal] [Bookmarks] [+ Advanced ▼]  │
├─────────────────────────────────────────────────────┤
│  [Cards - infinite scroll]                          │
└─────────────────────────────────────────────────────┘
```

### Components

1. **Search Bar** — Always visible input field
   - Real-time search via FTS5 (debounced 300ms)
   - Searches title + content
   - Results appear in feed below, replacing infinite scroll

2. **Type Tabs** — Quick filter by content type
   - Tabs: All, Notes, Journal, Bookmarks, Questions, Raw
   - Changes feed immediately, scroll resets to top
   - Uses content-type color tokens

3. **Advanced Filters** — Collapsible panel (`+ Advanced`)
   - **Tag multi-select** — Add/remove tags, type to search
   - **Date range** — Preset (last 7 days, last 30 days) + custom
   - **Source filter** — discord, web, hermes, api
   - **Clear all** button

4. **Feed Cards** — Balanced density, infinite scroll
   - Loads 20 items at a time
   - Respects active filters

### Card Style (Balanced)

```
┌─────────────────────────────────────────────┐
│ [NOTE] Docker networking basics        2h ago │
│ Bridge networks are the default. Each...     │
│ #docker #infrastructure                      │
└─────────────────────────────────────────────┘
```

**Elements:**

- Type badge (colored by content type)
- Title (truncated if long)
- Content preview (2-3 lines, ~150 chars)
- Tags (pill-style, first 3-4, click to filter)
- Timestamp (relative: 2h ago, 1d ago)

**Interaction:**

- Click card → navigate to `/item/[id]`
- Click tag → add to filter (multi-select)
- Click type badge → filter by type

---

## Item Detail Page (`/item/[id]`)

### Layout

```
┌─────────────────────────────────────────────────────┐
│ ShadowBrain    Browse    Search    Graph    Tags    Settings │
│ ← Back                                                │
├──────────────────────┬──────────────────────────────┤
│ [Main Content 70%]   │ [Sidebar 30%]                │
│                      │                              │
│ Type badge, title    │ LINKS (2)                    │
│ Markdown content     │ - Docker Compose (ref→)     │
│ Tags, metadata       │ - SSL cert (depends→)        │
│                      │                              │
│          [☰]         │ BACKLINKS (1)                │
│                      │ - Production deploy (←ref)   │
└──────────────────────┴──────────────────────────────┘
```

### Components

1. **Main Content (left, ~70%)**
   - Type badge (top, colored)
   - Title (h1)
   - Content (markdown-rendered)
   - Tags (clickable, filter to tag)
   - Metadata: created/updated timestamps, source

2. **Sidebar (right, ~30%)**
   - **Links** — Outbound links grouped by type
   - **Backlinks** — Inbound links
   - Each link shows: title, link type, direction arrow
   - Click link → navigate to that item

3. **Collapsible Sidebar**
   - `[☰]` button toggles sidebar
   - When hidden, content expands to full width
   - State persists per session

4. **Markdown Rendering**
   - Use `react-markdown` or similar
   - Support standard syntax, code blocks with syntax highlighting
   - Wikilink `[[Title]]` renders as clickable link

---

## Tags Page (`/tags`)

### Layout

```
┌─────────────────────────────────────────────────────┐
│ ShadowBrain    Browse    Search    Graph    Tags    Settings │
├─────────────────────────────────────────────────────┤
│  Tags Management                                      │
│  [+ New Tag]                                         │
│                                                       │
│  docker                    [23 items]                │
│    [Rename] [Delete] [Merge into...]                │
│                                                       │
│  infrastructure             [18 items]                │
│    [Rename] [Delete] [Merge into...]                │
└─────────────────────────────────────────────────────┘
```

### Features

- **List view** — All tags with usage counts. Sort by name or count.
- **Create tag** — `[+ New Tag]` button opens modal. Validates unique name, max length.
- **Rename tag** — Opens modal with input. Updates all `content_tags` references.
- **Delete tag** — Confirms deletion, removes from `content_tags`.
- **Merge tags** — Select target tag, moves all references, deletes source.

---

## Settings Page (`/settings`)

### Layout

```
┌─────────────────────────────────────────────────────┐
│ ShadowBrain    Browse    Search    Graph    Tags    Settings │
├─────────────────────────────────────────────────────┤
│  Settings                                              │
│                                                       │
│  AI Features                                          │
│  OpenRouter API Key    [sk-or-****]              [Save] │
│  Default Model        [mistral-7b... ▼]           [Save] │
│                                                       │
│  Export & Backup                                     │
│  [Export all as Markdown]  [Export as JSON]          │
│                                                       │
│  System Info                                         │
│  Total items: 145                                     │
│  Database size: 2.3 MB                                │
│  Last backup: Never                                   │
└─────────────────────────────────────────────────────┘
```

### Sections

1. **AI Features**
   - OpenRouter API Key (masked, save to `settings` table)
   - Default Model dropdown (available models from OpenRouter)

2. **Export & Backup**
   - Export all as Markdown
   - Export as JSON
   - (Future: backup reminders, backup schedule)

3. **System Info**
   - Total items count
   - Database size
   - Last backup timestamp

**Note:** Discord configuration lives in the WebSocket listener service config or Hermes settings, not here.

---

## Responsive Design

### Breakpoints

- **Desktop** (>1024px) — Full layout, sidebar visible by default
- **Tablet** (768-1024px) — Sidebar collapsed by default, card layout adjusts
- **Mobile** (<768px) — Single column, simplified nav, compact cards

### Mobile Navigation

```
┌─────────────────────┐
│ ShadowBrain    [☰] │
└─────────────────────┘
```

Hamburger menu opens: Browse, Search, Tags, Settings.

### Mobile Cards

Compact mode on mobile:

- Single-line title
- 1-line preview
- Tags hidden (show count instead: "3 tags")

---

## Design Tokens

Per `docs/design-tokens.md`:

### Colors

- **Backgrounds** — `neutral-950` (page), `neutral-900` (cards), `brand-800` (nav/accents)
- **Text** — `neutral-100` (headings), `neutral-200` (body), `neutral-300` (secondary)
- **Type badges** — Content-type colors (`type-journal`, `type-note`, `type-bookmark`, etc.)
- **Buttons** — `brand-600` (primary), `neutral-700` (secondary)

### Typography

- Headings: Inter or system font, 400-600 weight
- Body: Inter or system font, 14-16px
- Code: JetBrains Mono or Fira Code for code blocks

### Spacing

- Cards: 12px padding, 8px gap between cards
- Sections: 16-24px margins
- Nav: 44px height

---

## Components from shadcn/ui

Use existing shadcn components where possible:

- `Button`, `Input`, `Select` — Forms, settings
- `Badge` — Type badges, tags
- `Card` — Content cards
- `Dialog` / `Modal` — Tag create/rename/merge
- `Dropdown` — Advanced filters, model selection
- `ScrollArea` — Sidebar scroll
- `Separator` — Visual dividers

---

## Technical Notes

### State Management

- URL query params for filters (type, tags, date range)
- React state for UI-only concerns (sidebar toggled, advanced filters open)
- Server-side fetching for all data (React Query or SWR if complexity warrants)

### Infinite Scroll Implementation

- Use `IntersectionObserver` or library (react-intersection-observer)
- Fetch next page when sentinel element enters viewport
- Append to existing items, preserve scroll position

### Search Debounce

- 300ms delay on search input
- Cancel pending request if user types again
- Show loading indicator during fetch

---

## Dependencies

- Next.js App Router (already planned)
- React 19+ (already planned)
- Tailwind CSS (already planned)
- shadcn/ui (already planned)
- `react-markdown` for markdown rendering
- Syntax highlighting library (e.g., `react-syntax-highlighter`)
- Infinite scroll library (e.g., `react-intersection-observer`)

---

## Success Criteria

Phase 3 is complete when:

- [ ] User can browse all content in infinite-scroll feed
- [ ] User can search by keyword with real-time results
- [ ] User can filter by type, tags, date range
- [ ] User can view item detail with links/backlinks
- [ ] User can manage tags (create, rename, delete, merge)
- [ ] User can configure AI settings from UI
- [ ] UI works on mobile, tablet, desktop
- [ ] Dark mode uses design tokens correctly
- [ ] All pages are accessible and performant

---

## Future Work (Beyond Phase 3)

- Graph visualization page (Phase 5)
- Merge Search page with Browse (advanced filters panel makes dedicated search redundant)
- "On this day" resurfacing
- Image gallery view
- Bulk operations (select multiple items, batch edit)
- Real-time updates (Hermes captures appear live)
