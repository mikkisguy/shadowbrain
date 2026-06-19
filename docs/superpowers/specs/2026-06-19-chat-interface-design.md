# Chat Interface — Design Spec

## Overview

A chat surface inside ShadowBrain that unifies three capabilities through a single
Next.js SSE hub (`/api/chat`):

1. **Knowledge-grounded chat** — ask questions answered from the ShadowBrain
   SQLite knowledge base (retrieval-augmented).
2. **General chat** — plain LLM conversation with no grounding.
3. **Server administration** — drive the running **Hermes agent** to execute
   commands, manage services, and read logs, with tool-progress visibility and
   human-in-the-loop approval for destructive actions.

The hub talks to two **OpenAI-compatible** backends, selected per conversation:

- **Hermes agent** — `http://localhost:8642/v1`, bearer key `HERMES_API_KEY`. A
  full agent with native tools (`terminal`, `process`, file/web/vision, cron,
  MCP). Used for admin and as a conversation partner.
- **OpenCode Go models** — `https://opencode.ai/zen/go/v1`, subscription key
  `OPENCODE_GO_API_KEY`. Raw general chat across `glm` / `kimi` / `deepseek` /
  `mimo` (and `qwen`/`minimax` on the Anthropic-compatible endpoint — future).

Grounding is a **toggleable retrieval layer** in the Next.js process, so it works
identically regardless of backend.

## Goals

- One `/chat` page backed by one streaming `/api/chat` route.
- Switch conversation target between Hermes and any OpenCode Go model.
- Toggle RAG grounding on/off per thread (and per send).
- Persist threads and messages in the ShadowBrain DB.
- Insert content into ShadowBrain from chat (explicit action + model-driven tool).
- Full Hermes admin with **tool-progress surfacing** and **approval prompts**
  for destructive actions (core reliability requirement, not deferred).
- All provider keys stay server-side.

## Non-Goals (v1)

- Unified tool-grounding for Hermes via MCP (approach C) — future enhancement.
- OpenCode Go models on the Anthropic-compatible `/v1/messages` endpoint — v1
  uses the `/v1/chat/completions` Go-model subset only.
- Surfacing Hermes Runs beyond the current turn (no cross-turn run chaining) —
  each user message starts a new run; history comes from our `chat_messages`.
- Voice / TTS, image generation UI, mobile PWA packaging.

## Architecture

```
Browser (/chat)  ──SSE──►  Next.js /api/chat  (the hub)
                              │
                              ├─ RAG retrieval (optional) ─► ShadowBrain SQLite
                              ├─ load/persist  ───────────► chat_threads / chat_messages
                              ├─ insert tool   ───────────► content_items (+ FTS) via /api/items
                              │
                              ├─ target=hermes ──► Hermes Runs API (POST /v1/runs, events SSE, approval)
                              └─ target=go-model ► OpenCode Go /v1/chat/completions (AI SDK streamText)
```

The hub is the single streaming endpoint the UI talks to. It normalizes two
different backend transports into one SSE protocol toward the browser (see
**SSE Event Protocol**).

### Why two transports

- **Go-model targets** use the standard OpenAI Chat Completions stream via the
  Vercel AI SDK (`streamText`). Token deltas + our-layer tool calls. Simple.
- **Hermes target** uses Hermes's **Runs API** — `POST /v1/runs` returns a
  `run_id`; `GET /v1/runs/{run_id}/events` is an SSE stream of tool-call
  progress (`hermes.tool.progress`), token deltas, lifecycle events, and
  pending-approval states; `POST /v1/runs/{run_id}/approval` resolves a pending
  approval. This is the only Hermes path that exposes tool-progress and approval
  correctly, which is required for safe admin use.

## Components

### `lib/chat/providers.ts`

Registers OpenAI-compatible providers and exposes a typed **target** model:
`{ provider: 'hermes' | 'opencode-go', model: string }`. Helper to list models
per provider (cached `GET /v1/models`). Hermes lists `hermes-agent`; OpenCode Go
lists the model catalog.

### `lib/chat/retrieval.ts` (RAG)

Given the latest user message, runs FTS retrieval (reusing the Phase 1 search
helper / `sanitizeFts5Query`) with tag/type filters, and respects the
**two-level visibility** model (per the App Security Baseline spec §2):
**`is_hidden = 1` items are included in RAG by default** (they are AI-OK);
**`is_private = 1` items are excluded by default** and are only included when
the current thread has opted in via the per-thread **"Include private in AI"**
control (`chat_threads.include_private_in_ai = 1`, overridable per send).
Returns top-K items (`CHAT_RAG_TOP_K`, default 8). Renders a `## Retrieved
context` block for injection. Returns empty → hub proceeds without context
(no hard failure).

### `lib/chat/hermes-runs.ts`

Thin client for the Hermes Runs API: `createRun`, `streamEvents(runId)` (async
iterator yielding normalized events), `resolveApproval(runId, decision, ...)`.
Maps Hermes event types onto the hub's SSE protocol. The exact Runs request body
(how full message history is passed) is verified against the running Hermes
instance during implementation — the docs describe the lifecycle but not the
complete request schema.

### `app/api/chat/route.ts` (the hub)

Request: `{ threadId, target, grounded: boolean, allowModelSave: boolean, message }`.

Flow:

1. Persist the user message to `chat_messages`.
2. Load thread history from `chat_messages`.
3. If `grounded`: build context via `retrieval.ts`; prepend as a system block.
4. Branch on `target.provider`:
   - `opencode-go`: `streamText({ model, messages, tools })`. Register
     `save_to_shadowbrain` tool only when `allowModelSave` is true (executed
     locally by the AI SDK). Stream token deltas.
   - `hermes`: `createRun` with the assembled messages, then `streamEvents`.
     Forward tool-progress and approval events to the client; on
     approval-requested, pause for the client's decision and call
     `resolveApproval`.
5. On completion, persist the assistant message (content + any tool-call
   records) to `chat_messages`.

### `app/api/chat/threads/route.ts` (+ `[id]`)

CRUD for threads (list, create, rename, delete). Messages are read/written
through the hub and a `GET /api/chat/threads/[id]/messages` endpoint.

### `app/chat/page.tsx` (UI)

Builds on the Phase 3 design system (#20) and markdown rendering (#25).

- **Left rail:** new chat + recent threads.
- **Center:** streaming message list (markdown), input box, send.
- **Per-thread controls:** Target selector (Hermes / Go model), Grounding
  toggle, Allow-model-to-save toggle, **Include-private-in-AI toggle** (off
  by default; gates whether `is_private` items are included in the RAG
  context for this thread / message, per the App Security Baseline two-level
  visibility model).
- **Per-message:** "Save to ShadowBrain" action (type picker → `POST /api/items`).
- **Hermes activity:** collapsible tool-progress blocks; when target = Hermes,
  show an **"Admin mode (Hermes)"** indicator. Approval requests render inline
  with Approve / Deny buttons.

### Insert: `save_to_shadowbrain`

- **Explicit button:** client calls `POST /api/items` with chosen type. Works
  for **both** targets.
- **Model-driven tool:** `save_to_shadowbrain({ type, content, title?, tags? })`,
  active **only for Go-model targets** (AI SDK executes it locally in our
  process). Not active for Hermes (see Non-Goals / Open Questions) — Hermes-side
  grounding/insert is via the explicit button, or future MCP.

## SSE Event Protocol (hub → browser)

The hub emits a single SSE stream carrying typed parts:

- `text-delta` — token text.
- `tool-progress` — `{ tool, label, status }` (e.g. `terminal` running `ls -la`).
- `approval-requested` — `{ runId, summary, command? }` → client shows Approve/Deny.
- `approval-resolved` — outcome after the user decides.
- `tool-result` / `saved` — confirmation that an insert produced a content item.
- `error` — provider/auth/stream failures with a retry signal.

Go-model targets emit `text-delta`, `tool-*`, `saved`, `error`. Hermes targets
emit the full set including `tool-progress`, `approval-requested/resolved`.

## Data Model (new migration)

Two tables, following `docs/schema.md` conventions:

```sql
CREATE TABLE chat_threads (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  target_provider  TEXT NOT NULL,          -- 'hermes' | 'opencode-go'
  target_model     TEXT NOT NULL,
  grounded         INTEGER NOT NULL DEFAULT 1,  -- RAG on/off
  allow_model_save INTEGER NOT NULL DEFAULT 0,
  include_private_in_ai INTEGER NOT NULL DEFAULT 0,  -- per-thread "Include private in AI" opt-in (gates is_private in RAG)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_messages (
  id               TEXT PRIMARY KEY,
  thread_id        TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,          -- 'user' | 'assistant' | 'system' | 'tool'
  content          TEXT NOT NULL,
  tool_calls       TEXT,                    -- JSON array, nullable
  tool_call_id     TEXT,                    -- nullable
  target_provider  TEXT,
  target_model     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chat_messages_thread ON chat_messages (thread_id, created_at);
```

Chat messages are **not** knowledge items and do **not** enter FTS. Anything
saved via insert becomes a normal `content_item` (and is then searchable).

## Configuration

Environment / `settings` table:

- `HERMES_API_BASE` (default `http://localhost:8642/v1`)
- `HERMES_API_KEY` (= Hermes `API_SERVER_KEY`)
- `OPENCODE_GO_API_BASE` (default `https://opencode.ai/zen/go/v1`)
- `OPENCODE_GO_API_KEY`
- `CHAT_RAG_TOP_K` (default 8), `CHAT_RAG_INCLUDE_PRIVATE` (default 0)

Hermes must run with `API_SERVER_ENABLED=true` and its API server bound to an
address reachable from the Next.js process (localhost by default). For
browser-direct calls we do **not** rely on Hermes CORS — the Next.js hub calls
Hermes server-to-server, so no CORS allowlist is required.

## Error Handling

- Provider unreachable / 401 / rate-limited → `error` event in-thread, no crash,
  retry button. Provider key missing → clear "not configured" message.
- RAG retrieval throws or returns nothing → proceed without context; never block
  chat.
- Hermes run awaiting approval times out → mark turn as `awaiting-approval`,
  resumable.
- Interrupted stream → persist the partial assistant message; mark
  `truncated`.
- Tool/insert failure → return error to the model so it can recover; explicit
  button failure → inline message, input preserved.

## Security

- All provider keys server-side only (env / `settings`); never sent to the
  client.
- Hermes admin is powerful: keep Hermes localhost-bound; `HERMES_API_KEY`
  required; the hub is the only thing calling Hermes.
- RAG is read-only on local SQLite; excludes `is_private` by default (matches
  `docs/hermes-integration.md` privacy rules).
- Destructive Hermes actions are gated by the approval flow; UI shows explicit
  **Admin mode (Hermes)** indicator whenever the Hermes toolset is live.

## Testing

- Unit: retrieval (FTS + private exclusion), provider target mapping, Hermes
  event normalization, SSE protocol shaping.
- Integration (mocked backends): Go-model stream round-trip; Hermes run with a
  tool-progress event and an approval-requested → resolved sequence; grounded vs
  ungrounded context injection; insert via tool and via explicit button.
- Persistence: thread/message CRUD, cascade delete, history reload.

## Phasing (proposed "Chat" track)

Vertical slices, each independently shippable:

1. **Provider abstraction + hub + minimal UI + persistence** — talk to a Go
   model end-to-end: streamed response, threads saved, history reloads.
2. **RAG grounding + toggle** — retrieval injection, per-thread/per-send toggle.
3. **Insert** — explicit "Save to ShadowBrain" button (both targets) + Go-model
   `save_to_shadowbrain` tool.
4. **Hermes target via Runs API** — tool-progress surfacing + approval
   prompts/resolution (core). Admin-mode indicator.
5. **UI polish** — target selector, grounding/allow-save controls, tool-progress
   & approval rendering, markdown, save action.

(Dependencies: 2–4 build on 1. 4 is independent of 2–3.)

## Open Questions

- **Hermes-side insert/grounding via MCP:** should we later expose ShadowBrain
  search/insert as an MCP server registered with Hermes, so Hermes can ground &
  save natively? (Currently out of scope; revisit after v1.)
- **Approval policy defaults:** auto-deny patterns for clearly destructive
  commands server-side, even before prompting the user? (v1: always prompt.)
- **Go-model tool support:** undocumented for OpenCode Go — if a selected model
  ignores tools, the explicit save button still works; confirm per-model in v1.
