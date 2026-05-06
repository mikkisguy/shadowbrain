     1|# Interaction Methods
     2|
     3|ShadowBrain is useless if stuff doesn't get *in*. Here's every planned interaction path, ordered by priority.
     4|
     5|---
     6|
     7|## Primary: Discord via Hermes
     8|
     9|**This is the main interface.** You talk to Hermes, Hermes talks to ShadowBrain.
    10|
    11|### Capture
    12|```
    13|"save this: need to fix the rate limiting on the keila-admin API"
    14|→ Hermes writes to content_items (type='raw', source='hermes')
    15|→ Confirms: "Saved. It'll be compiled in tonight's journal."
    16|```
    17|
    18|```
    19|"bookmark https://sqlite.org/queryplanner.html for the database indexing project"
    20|→ Hermes fetches title, saves as type='bookmark', links to project
    21|→ Confirms: "Bookmarked 'Query Planning' and linked it to the database indexing project."
    22|```
    23|
    24|### Queries
    25|```
    26|"what was I working on last tuesday?"
    27|→ Hermes queries content_items WHERE date(...) AND type='journal'
    28|→ Returns summary with links to related notes
    29|```
    30|
    31|```
    32|"find notes similar to my Docker networking one"
    33|→ Hermes queries content_vectors (semantic similarity)
    34|→ Returns top 5 with similarity scores
    35|```
    36|
    37|```
    38|"what do I have saved about postgres indexing?"
    39|→ Hermes hybrid search: FTS + tags + links
    40|→ Returns everything: notes, bookmarks, journal mentions
    41|```
    42|
    43|### Why Hermes is the primary layer
    44|
    45|- **Zero UI switching** — you're already in Discord
    46|- **Natural language** — no learning curve, just talk
    47|- **Contextual** — Hermes knows your conversation history
    48|- **Multi-device** — Discord is on every device you own
    49|
    50|---
    51|
    52|## Secondary: Web UI
    53|
    54|The web UI at `https://$DOMAIN` (or new domain) is the full-featured backup interface.
    55|
    56|### Use cases
    57|- **Browse and explore** your knowledge graph
    58|- **Graph visualization** — see connections visually
    59|- **Long-form editing** — write detailed notes
    60|- **Tag management** — organize your taxonomy
    61|- **Settings** — configure AI models, API keys
    62|- **Export** — download your data
    63|
    64|### Design principles
    65|- Dark mode by default, light mode option
    66|- Server-rendered for fast initial loads
    67|- Client-rendered for interactive features
    68|- shadcn/ui for consistent premium feel
    69|- Responsive: works on phone, tablet, desktop
    70|
    71|---
    72|
    73|## Tertiary: Quick Capture Shortcuts
    74|
    75|### Browser bookmarklet
    76|```
    77|javascript:void(open('https://$DOMAIN/add?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)))
    78|```
    79|One click → pre-filled bookmark form.
    80|
    81|### Raycast / Alfred integration (future)
    82|Typing `sb save <thought>` from anywhere on your desktop.
    83|
    84|### Mobile share sheet (future)
    85|iOS/Android share target → ShadowBrain captures URL + selected text.
    86|
    87|### Email-to-inbox (future)
    88|Forward emails to `inbox@$DOMAIN` → saved as raw entries with source preservation.
    89|
    90|---
    91|
    92|## API
    93|
    94|Clean REST API for building your own tools.
    95|
    96|| Endpoint | Method | Purpose |
    97||----------|--------|---------|
    98|| `/api/items` | GET | Search, filter, paginate all content |
    99|| `/api/items` | POST | Create any content type |
   100|| `/api/items/[id]` | GET | Single item with links, tags, vectors |
   101|| `/api/items/[id]` | PATCH | Update content, tags, links |
   102|| `/api/items/[id]` | DELETE | Remove with cascade |
   103|| `/api/search` | GET | Hybrid search (FTS + semantic) |
   104|| `/api/tags` | GET/POST | List/create tags |
   105|| `/api/links` | POST | Create typed link between items |
   106|| `/api/export/markdown` | GET | Export all/some content as .md |
   107|| `/api/import` | POST | Bulk import JSON/CSV |
   108|
   109|---
   110|
   111|## The Frictionless Principle
   112|
   113|Every interaction path should satisfy:
   114|
   115|1. **< 3 seconds to capture**: Thought → saved in under 3 seconds
   116|2. **No context switching required**: Stay in your current flow
   117|3. **Confirmation is fast**: "Saved." not "Your content has been successfully persisted..."
   118|4. **Graceful failure**: If something breaks, it queues and retries — never "error, try again later"
   119|5. **Works offline-ish**: Web UI caches; Discord has its own retry
   120|
   121|---
   122|
   123|## What NOT to build (yet)
   124|
   125|- **Native mobile app** — PWA + Hermes + Discord covers mobile
   126|- **Real-time collaboration** — single-user system
   127|- **Public sharing / publishing** — Phase 4 at earliest
   128|- **Plugin marketplace** — composable API enables this later if needed
   129|