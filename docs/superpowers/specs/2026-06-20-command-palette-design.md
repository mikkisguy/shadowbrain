# Command Palette — Design Spec

**Date:** 2026-06-20
**Status:** Draft
**Parent:** Phase 3 — Web UI Core (`docs/superpowers/specs/2026-05-07-web-ui-core-design.md`)

---

## Overview

A global command palette (Cmd+K / Ctrl+K) that replaces the planned
6-section top navigation bar in #20. The palette is the primary navigation
mechanism: it lists the app's pages by default, and as the user types it
merges in content results from the existing FTS5 search API. The minimal
top nav keeps a centered palette trigger and a few utility controls (theme
toggle, user menu).

A dedicated "Search" page (the second nav section in the original web-UI
spec) is no longer needed — content search lives in the palette. The Browse
page also drops its inline search bar (web-UI spec line 36) for the same
reason. The `Search` route is removed from the page list.

---

## Why

The original web-UI spec (2026-05-07) predates the chat track and the
proliferation of routes. Six top-level links is too many to scan on a
single line, especially on mobile. A command palette scales better: it
takes the same screen real estate regardless of how many pages the app
grows to, and it doubles as the global content search. This is the pattern
used by Linear, Notion, GitHub, and Raycast.

---

## User-facing behavior

### Open / close

- **Desktop:** `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) opens the
  palette from any page. The shortcut is global and works regardless of
  focused element, except when an input or textarea has focus and the
  user is actively typing — in that case, `Esc` first blurs the field, and
  a second `Esc` closes the palette. (Standard pattern; avoids hijacking
  text input.)
- **Mobile:** a magnifying-glass icon in the top nav opens the palette.
  There is no keyboard shortcut on mobile.
- The centered trigger button in the top nav is also clickable on desktop
  (for users who don't know the shortcut).
- **Close:** `Esc`, click outside the modal, or selecting an item.

### Default view (no query typed)

A "Pages" group showing all 5 app routes + a small set of utility items:

| Item         | Action                                                                |
| ------------ | --------------------------------------------------------------------- |
| Browse       | navigate to `/`                                                       |
| Chat         | navigate to `/chat`                                                   |
| Graph        | navigate to `/graph` (placeholder)                                    |
| Tags         | navigate to `/tags`                                                   |
| Settings     | navigate to `/settings`                                               |
| Toggle theme | toggles dark/light mode                                               |
| Sign out     | clears session, navigates to `/login` (only shown when authenticated) |

No "Recent" section in v1 (no localStorage persistence). Items are listed
in a fixed order so the user can build muscle memory.

### Typed query

The palette has a single text input. As the user types:

1. **Filter Pages group** — fuzzy-match the query against the page titles
   and (where relevant) keywords. Items that don't match the fuzzy filter
   are hidden. The match is case-insensitive and subsequence-based
   (e.g. `br` matches `Browse`).
2. **Fetch Content group** — once the query is ≥ 2 characters, debounce
   300ms and call `GET /api/search?q=...&limit=8`. The response is shown
   in a "Content" group below "Pages". Each result shows: title, type
   badge, and a short snippet (the existing `<mark>`-highlighted snippet
   from FTS5).
3. **Empty Content group** — if the search returns zero hits, the
   "Content" group header still renders with a "(no results)" line. This
   is intentional: hiding the group on empty results makes the layout
   jumpy as the user types.

### Keyboard navigation

- `↑` / `↓` — move selection up/down across the merged result list
- `Enter` — activate the selected item (navigate or run the action)
- `Esc` — close the palette (or, if an inner input is focused, blur it
  first; palette closes on the second `Esc`)
- The selected item is visually highlighted; on first open, the first
  item is selected by default

### Mobile

- Palette opens full-screen (no centered modal — that becomes tiny under
  the iOS keyboard)
- The trigger icon is in the top nav (right of the brand, before the user
  menu)
- The virtual keyboard is shown automatically when the palette opens
- Result list is taller (more vertical real estate) and snaps to the
  top of the keyboard

---

## Layout

### Minimal top nav (replaces the 6-link bar in #20)

```
Desktop:
┌─────────────────────────────────────────────────────────────────┐
│  [logo]  ShadowBrain    [ ⌕  Search ShadowBrain...   ⌘K ]  [ ☾ ] [user] │
└─────────────────────────────────────────────────────────────────┘

Mobile:
┌──────────────────────────────────────────┐
│  [logo] ShadowBrain    [⌕]      [user]   │
└──────────────────────────────────────────┘
```

- The centered trigger is a button styled like a search input (it is
  _not_ an input — clicking it opens the palette). The `⌘K` hint on the
  right edge is a keyboard-shortcut affordance.
- On hover/focus, the trigger lightens to signal it's interactive.
- The trigger is hidden on mobile (replaced by the icon to its right).
- The user menu (avatar + dropdown) is a placeholder in v1 — a static
  "Sign in" / "Sign out" link is fine until #53 lands.

### Palette modal

```
Desktop:
┌──────────────────────────────────────────────────────────────┐
│  ⌕  Type a command or search...                              │
├──────────────────────────────────────────────────────────────┤
│  Pages                                                       │
│  → Browse                                                    │
│    Chat                                                      │
│    Graph                                                     │
│    ...                                                       │
│  Content                                                     │
│    [note]  Docker compose notes — …highlighted snippet…      │
│    [bookmark]  Docker hub — …another snippet…                │
└──────────────────────────────────────────────────────────────┘
                ↑ ~480px wide, centered, top-third
```

```
Mobile:
┌──────────────────────────────────────────────────────────────┐
│  ←  ⌕  Type a command or search...                           │
├──────────────────────────────────────────────────────────────┤
│  Pages                                                       │
│  → Browse                                                    │
│    Chat                                                      │
│    ...                                                       │
│  Content                                                     │
│    ...                                                       │
└──────────────────────────────────────────────────────────────┘
                ↑ full-screen, no close button (back arrow)
```

---

## Components

New files under `src/components/command-palette/`:

| File                   | Responsibility                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CommandPalette.tsx`   | Modal markup + state. Receives `open` and `onOpenChange`.                                                                                           |
| `CommandTrigger.tsx`   | The nav button. Click → `onOpenChange(true)`. Renders as search-input-styled button (desktop) or magnifying-glass icon (mobile).                    |
| `useCommandPalette.ts` | Hook: listens for the global `Cmd+K` / `Ctrl+K` keydown. Returns `{ open, setOpen }` and an imperative `toggle()`. Mounted once in the root layout. |
| `command-items.ts`     | Static list of pages + utility items. Exports `pages: CommandItem[]` and `utilities: CommandItem[]`.                                                |
| `fuzzy-filter.ts`      | Tiny subsequence-based fuzzy matcher. No dependency on fuse.js — subsequence matching is sufficient for ~10 pages.                                  |

The palette uses shadcn `Dialog` (for the modal) + shadcn `Command` (cmdk,
for the input + list). Both are added by `npx shadcn@latest add dialog command`
in the issue's setup step.

The Search route is **removed** from the page list in `command-items.ts`.
The web-UI spec's `/search` page (line 20) is no longer built — content
search is exclusively in the palette.

---

## Data flow

```
User presses Cmd+K (or clicks trigger)
  → useCommandPalette.setOpen(true)
  → CommandPalette renders Dialog with Command input focused

User types "docker"
  → local state: query = "docker"
  → filter Pages group via fuzzy-filter.ts
  → useEffect: debounce 300ms, then fetch /api/search?q=docker&limit=8
  → render Content group with results

User presses ↓ then Enter
  → selection moves
  → Enter activates the selected CommandItem:
      - Page item: router.push(item.href)
      - Utility item: run item.action() (e.g. toggleTheme(), signOut())
  → palette closes
```

The fetch uses the existing `GET /api/search` route from
`src/app/api/search/route.ts`. No new server endpoint is needed. The
existing rate-limit and Zod validation apply.

---

## Acceptance criteria

- [ ] `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux) opens the palette from
      any page
- [ ] The trigger button in the top nav also opens the palette
- [ ] On mobile, a magnifying-glass icon in the top nav opens the
      palette full-screen
- [ ] Default view shows the 5 app routes + Toggle theme + Sign out
      (when authenticated)
- [ ] Typing filters the Pages group via fuzzy matching
- [ ] Typing ≥ 2 characters triggers a debounced 300ms FTS5 search via
      `/api/search`
- [ ] Content results show title, type badge, and snippet with `<mark>`
      highlights
- [ ] Empty search results render "(no results)" in the Content group
      (the group header is not hidden)
- [ ] `↑` / `↓` move selection; `Enter` activates; `Esc` closes
- [ ] Click outside the modal closes the palette
- [ ] When an input/textarea is focused, `Esc` blurs the field first;
      a second `Esc` closes the palette
- [ ] The Browse page no longer has its own search bar
- [ ] The `/search` route is removed from the page list (the route file
      is not created)
- [ ] All 5 routes are reachable from the palette's default view
- [ ] Tests: keyboard shortcut, fuzzy filter, FTS5 fetch + render,
      navigation on Enter, mobile trigger, Esc behavior

---

## Dependencies

**Blocks:**

- Nothing. The palette is an independent UI feature.

**Blocked by:**

- Phase 1 APIs (done) — `/api/search` must exist for content search
- #20 (design system + minimal nav shell) — the trigger lives in the new
  minimal nav
- shadcn `Dialog` and `Command` (cmdk) — added by this issue

**Replaces:**

- The 6-section top nav in #20's acceptance criteria ("Nav links: Browse,
  Chat, Search, Graph, Tags, Settings") is replaced by the minimal nav
  - palette. #20's AC for the top nav is updated to: "minimal nav with
    centered palette trigger + theme toggle + user menu."
- The Browse page's inline search bar (`web-ui-core-design.md` line 36)
  is removed.
- The `/search` page (web-UI spec line 20) is not built.

---

## Out of scope (future work)

These are deliberately deferred. They become natural follow-up issues
once v1 is in production:

- **Action items** ("Create new note", "Capture from clipboard") — v1 is
  navigation + content search only
- **Recent items** in the default view — needs `localStorage` persistence
- **Slash commands** inside the input (`>` for actions, `/` for pages) —
  v1 is a single search box
- **Provider-agnostic chat shortcut** — once #48 lands, a separate
  shortcut (e.g. `Cmd+/`) can open a chat-only palette
- **Keyboard shortcut per page** (`Cmd+1` → Browse, etc.) — discoverable
  later, after users are familiar with the palette

---

## Open questions

_None at draft time. Add to this section if new questions surface during
review._
