# Interaction Methods

ShadowBrain is useless if stuff doesn't get _in_. Here's every planned interaction path, ordered by priority.

---

## Primary: Discord via Hermes

**This is the main interface.** You talk to Hermes, Hermes talks to ShadowBrain.

### Capture

```
"save this: need to fix the rate limiting on the keila-admin API"
→ Hermes writes to content_items (type='raw', source='hermes')
→ Confirms: "Saved. It'll be compiled in tonight's journal."
```

```
"bookmark https://sqlite.org/queryplanner.html for the database indexing project"
→ Hermes fetches title, saves as type='bookmark', links to project
→ Confirms: "Bookmarked 'Query Planning' and linked it to the database indexing project."
```

### Queries

```
"what was I working on last tuesday?"
→ Hermes queries content_items WHERE date(...) AND type='journal'
→ Returns summary with links to related notes
```

```
"find notes similar to my Docker networking one"
→ Hermes queries content_vectors (semantic similarity)
→ Returns top 5 with similarity scores
```

```
"what do I have saved about postgres indexing?"
→ Hermes hybrid search: FTS + tags + links
→ Returns everything: notes, bookmarks, journal mentions
```

### Why Hermes is the primary layer

- **Zero UI switching** — you're already in Discord
- **Natural language** — no learning curve, just talk
- **Contextual** — Hermes knows your conversation history
- **Multi-device** — Discord is on every device you own

---

## Secondary: Web UI

The web UI at `https://$DOMAIN` (or new domain) is the full-featured backup interface.

### Use cases

- **Browse and explore** your knowledge graph
- **Graph visualization** — see connections visually
- **Long-form editing** — write detailed notes
- **Tag management** — organize your taxonomy
- **Settings** — configure AI models, API keys
- **Export** — download your data

### Design principles

- Dark mode by default, light mode option
- Server-rendered for fast initial loads
- Client-rendered for interactive features
- shadcn/ui for consistent premium feel
- Responsive: works on phone, tablet, desktop

---

## Tertiary: Quick Capture Shortcuts

### Browser bookmarklet

```
javascript:void(open('https://$DOMAIN/add?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)))
```

One click → pre-filled bookmark form.

### Raycast / Alfred integration (future)

Typing `sb save <thought>` from anywhere on your desktop.

### Mobile share sheet (future)

iOS/Android share target → ShadowBrain captures URL + selected text.

### Email-to-inbox (future)

Forward emails to `inbox@$DOMAIN` → saved as raw entries with source preservation.

---

## API

Clean REST API for building your own tools.

| Endpoint               | Method   | Purpose                               |
| ---------------------- | -------- | ------------------------------------- |
| `/api/items`           | GET      | Search, filter, paginate all content  |
| `/api/items`           | POST     | Create any content type               |
| `/api/items/[id]`      | GET      | Single item with links, tags, vectors |
| `/api/items/[id]`      | PATCH    | Update content, tags, links           |
| `/api/items/[id]`      | DELETE   | Remove with cascade                   |
| `/api/search`          | GET      | Hybrid search (FTS + semantic)        |
| `/api/tags`            | GET/POST | List/create tags                      |
| `/api/links`           | POST     | Create typed link between items       |
| `/api/export/markdown` | GET      | Export all/some content as .md        |
| `/api/import`          | POST     | Bulk import JSON/CSV                  |

---

## The Frictionless Principle

Every interaction path should satisfy:

1. **< 3 seconds to capture**: Thought → saved in under 3 seconds
2. **No context switching required**: Stay in your current flow
3. **Confirmation is fast**: "Saved." not "Your content has been successfully persisted..."
4. **Graceful failure**: If something breaks, it queues and retries — never "error, try again later"
5. **Works offline-ish**: Web UI caches; Discord has its own retry

---

## What NOT to build (yet)

- **Native mobile app** — PWA + Hermes + Discord covers mobile
- **Real-time collaboration** — single-user system
- **Public sharing / publishing** — Phase 4 at earliest
- **Plugin marketplace** — composable API enables this later if needed
