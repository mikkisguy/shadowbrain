# App Security Baseline — Design Spec

**Date:** 2026-06-19
**Status:** Draft

---

## Overview

The defense-in-depth security baseline for ShadowBrain when deployed on a
public VPS behind nginx. This spec covers the Next.js app's middleware,
query layer, and route handlers. It builds on the in-flight session-auth
issue (#53) and adds the rest of the controls needed to keep a single
user's private knowledge safe from internet-borne attackers.

The threat model assumes a public-internet deployment: an unauthenticated
attacker can reach the server's port and attempt to read or modify
content. The defense is layered so that a bug in any one layer does not
expose data.

The database is protected at rest by host access controls and by regular
backups to Proton Drive (see the
[backup reminder spec](../blob/main/docs/superpowers/specs/2026-06-19-backup-reminder-design.md));
no application-layer encryption is applied, since such layers collapse to
zero protection when the encryption key is co-located with the data on
the same host.

## Goals

- Authentication and session management (delegated to #53; this spec depends on it).
- Two-level visibility (`is_hidden` + `is_private`) with strict hide-by-default and auth-gated opt-in.
- CSRF protection on state-changing routes.
- Standard security response headers (CSP, HSTS, X-Frame-Options, etc.).
- Global rate limiting (per IP) on all routes, in addition to the strict login rate limit.
- CORS hardening: same-origin only, explicit deny of cross-origin.
- Regular backups of the database to Proton Drive (E2E encrypted by the destination), with an in-app reminder to ensure they happen — see the backup reminder spec.
- Centralized security configuration in `src/lib/security.config.ts`.
- A test suite covering the baseline controls and updating existing tests to authenticate.

## Non-Goals (v1)

- HTTPS / TLS termination at nginx (separate deployment-security spec).
- Full-disk encryption (declined for v1).
- Backup encryption.
- Secrets rotation.
- Multi-user / roles (ShadowBrain is single-user per `docs/vision.md`).
- Proton Pass / `pass-cli` integration (deferred; see Future Work).


## Architecture

The baseline is implemented across the following layers, each independent
so that a failure in one does not bypass the others:

```
Browser
  → Next.js middleware  (auth + headers + CSRF + rate limit)
  → Route handler       (Zod validation, auth-gated visibility flags)
  → src/db/index.ts     (read helpers: includeHidden / includePrivate)
  → SQLite file (plaintext at rest; protected by host access controls + regular backups to Proton Drive — see backup reminder spec)
```

Auth (login, session cookies, password hashing, login rate limit) is
owned by #53; the rest of the controls are owned by this spec. The chat
RAG layer (chat spec + issue #49) is a consumer of the read helpers and
applies its own opt-in semantics for `is_private` (see Cross-Spec Impact).

## Controls

### 1. Authentication (reference #53)

- Single-user, env-configured admin: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (bcrypt, cost ≥ 10).
- Session cookies: `HttpOnly`, `Secure` in production, `SameSite=Lax`, signed with `SESSION_SECRET`.
- **Session lifetime — `SESSION_MAX_AGE`:** env var in milliseconds, **clamped to [1h, 30d]**, default **24h** (tunable: shorter for tighter security, longer for personal convenience). **Sliding renewal on activity**, so the value also acts as an inactivity timeout. Invalid or out-of-range values fall back to the default. Borrowed from branchforge's proven `getSessionMaxAge()` (clamping + sliding).
- **Constant-time login (timing-enumeration prevention, OWASP ASVS V3.2.2):** on a **user-not-found miss**, the login flow still runs a `bcrypt.compare` against a **precomputed dummy hash** so the response time is constant regardless of whether the user exists. A generic `"Invalid credentials"` error is returned for both "user not found" and "wrong password". Combined with login rate limiting (§5), this prevents both timing-based and brute-force username enumeration.
- `src/middleware.ts` protects all routes except `/login`, `/api/auth/*`, static assets.
- Unauthenticated browser requests → redirect to `/login`; unauthenticated API requests → `401`.
- Login rate-limited (≈5 attempts / 15 min / IP); login success/failure and logout logged to `audit_logs`.

### 2. Two-level visibility (`is_hidden` + `is_private`)

Two independent flags, each defaulting to `0` (visible). Both are hidden
from default read paths; the difference is the AI / RAG behavior.

- `is_hidden = 1` — exclude from default views; **AI may use in chat context by default**.
- `is_private = 1` — exclude from default views; **AI may use only on explicit per-thread / per-send opt-in**.

**Use-case note:** `is_private` is for ShadowBrain-stored content the user
does not want shared externally (the chat AI being the primary external
consumer). True secrets (passwords, bank details) live in Proton Pass and
will be accessed via a future `pass-cli` integration; they are not stored
in ShadowBrain. The two-level model therefore covers the realistic
content spectrum: items in ShadowBrain that are fine for AI to know
about (`is_hidden` or neither), and items in ShadowBrain that are not
(`is_private`).

**Data layer changes:**

- Migration: add `is_hidden INTEGER NOT NULL DEFAULT 0` to `content_items`. Existing items default to visible.
- Read helpers in `src/db/index.ts` gain `includeHidden?: boolean` and `includePrivate?: boolean` options, both defaulting to `false`:
  - `contentItems.listWithFilters` — when false / false, filter `WHERE is_hidden = 0 AND is_private = 0`.
  - `contentItems.findById` / `findWithRelations` — an item is returned only if every set visibility flag is covered by the corresponding opt-in. Concretely, with both opt-ins defaulting to `false`:
    - `is_hidden = 0`, `is_private = 0` → always returned.
    - `is_hidden = 1`, `is_private = 0` → returned only if `includeHidden = true`.
    - `is_hidden = 0`, `is_private = 1` → returned only if `includePrivate = true`.
    - `is_hidden = 1`, `is_private = 1` → returned only if **both** `includeHidden = true` **and** `includePrivate = true`.
    Otherwise (any set visibility flag without its corresponding opt-in), the function returns `null` — treated as not found by the route, which returns `404`. This is the strictest interpretation and matches the defense-in-depth principle: an item with both flags set requires both opt-ins.
  - `search.query` / `search.queryByType` — when false / false, exclude items with `is_hidden = 1 OR is_private = 1`.
- Zod schemas: `POST /api/items` and `PATCH /api/items/[id]` accept optional `is_hidden` and `is_private`.

**Auth-gated opt-in:**

- An unauthenticated request can never set either flag to `true`, regardless of query string or body.
- Authenticated callers (the admin) can opt in via `?include_hidden=1` / `?include_private=1`.
- The admin UI (Phase 3 browse / detail pages) can surface a "show hidden" / "show private" toggle that passes the opt-in.

**Why "strict by default":** the default is false / false, so a future
route that forgets to pass the options still filters both kinds of
hidden rows. Defense in depth — the same rationale as before, now
covering two axes.

### 3. CSRF — origin check

For a same-origin web UI, the simplest robust CSRF defense is **Origin /
Referer header check** on state-changing requests (POST / PATCH / DELETE).
No double-submit token is needed.

- Middleware guard: on POST / PATCH / DELETE, check `Origin` (preferred) or `Referer`. Allow only if it matches the app's configured origin (derived from `DOMAIN`, e.g. `https://shadowbrain.example.com`). Mismatch → `403 Forbidden`.
- **Constant-time comparison:** the Origin / allowed-origin compare uses `crypto.timingSafeEqual` with length-difference handling (pad / truncate the provided buffer to the expected length so the work is independent of the caller's input length). This avoids leaking the length of the allowed origin to an attacker probing with varying-length headers.
- **Exemption-list discipline:** the exempt list (only `/login`, `/api/auth/*`, static assets) is matched by **exact normalized pathname equality** — never by suffix or prefix pattern. A blind suffix match would let any future route ending in `/login` (e.g. a future `/api/admin/login`) silently inherit the CSRF exemption, so the exempt list is minimal, compared as exact pathnames (query string stripped, trailing slashes normalized), and reviewed on every change. A test asserts that no current route is exempt beyond the documented set.
- `SameSite=Lax` session cookies (from #53) are the second layer — they prevent the browser from sending the session cookie on cross-site requests.
- This refines #53's CSRF approach to **origin check** (rather than double-submit token).

### 4. Security headers

Applied by `src/middleware.ts` (or `next.config` headers). Standard,
restrictive set, centralized in `src/lib/security.config.ts`:

- `Content-Security-Policy` — strict, `'self'`, no `unsafe-inline` / `unsafe-eval` (Next.js nonces for inline), block frames / objects. Configurable via the security config.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — relies on HTTPS at nginx (deployment concern, out of scope for this spec).
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`

### 5. Rate limiting

In-memory token bucket per IP, sufficient for a single VPS. Module:
`src/lib/rate-limit.ts`.

- **Login** (already in #53): strict, ≈5 attempts / 15 min / IP.
- **All API routes**: gentle global limit, ≈120 req / min / IP.
- **All other routes**: broader limit, ≈600 req / min / IP.
- Returns `429` with `Retry-After`.
- **Trusted-proxy note:** behind nginx, the real client IP is in `X-Forwarded-For` (or `X-Real-IP`). The app must read the real IP from the trusted proxy header. The rate-limit module accepts a `getClientIp(request)` helper that reads from the configured header; production deployment must ensure nginx sets the header and the app trusts it. A deployment-security follow-up will harden the nginx config.

### 6. CORS

- Web UI is same-origin → no `Access-Control-Allow-Origin` header is set.
- The CSRF origin check (§3) already rejects cross-origin requests.
- If a future feature needs CORS (e.g. a separate mobile client), add an explicit tight allowlist. Out of scope for v1.


## 8. SSRF protection for URL-fetch endpoints

URL-fetch endpoints — **#17 (bookmark auto-fetch metadata)** and **#44 (image capture: download + WebP conversion)** — accept URLs from user input or external sources (Discord) and fetch arbitrary remote resources. Without explicit protection, an attacker can trick the server into fetching internal resources: `http://127.0.0.1:8642/v1` (the Hermes API!), cloud metadata endpoints (`169.254.169.254`), or other internal network addresses — a classic SSRF.

- **Block private / loopback / link-local addresses:** the URL validator rejects targets in `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1/128`, `fc00::/7`, and the host's own addresses.
- **DNS resolution check:** resolve the hostname and verify the resolved IP is not private / loopback / link-local. Use the resolved IP for the actual fetch, not a re-resolution, to prevent DNS rebinding.
- **Block redirects to private addresses:** the fetch client must not follow redirects to disallowed targets (or must re-validate each redirect against the same allowlist).
- **Single shared validator:** a single `validateFetchUrl(url)` helper is used by all URL-fetch code paths so the rules cannot diverge.
- **Timeout and size limits:** the fetch has a short timeout and a response-size cap to limit abuse.

This is a real gap the rest of the spec does not cover. Implemented as **issue G**.

## 9. CI security

Operational security — keeps vulnerabilities visible and dependencies fresh. Implemented as **issue H**.

- **CodeQL analysis workflow** (`.github/workflows/codeql.yml`): scans every PR and runs on a weekly schedule; languages `javascript-typescript`. Adapted from branchforge's proven workflow.
- **Lint / typecheck / test workflow** (`.github/workflows/lint.yml`): runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on every PR.
- **Renovate config** (`renovate.json`): automated dependency updates with a `minimumReleaseAge` (a few days) to avoid the supply-chain risk of brand-new releases; groups non-major dependency updates; auto-merge for low-risk dev-dependency patches. Adapted from branchforge.
- **`SECURITY.md`** at the repo root: a short vulnerability-reporting policy (how to report privately) and a short list of deployment best-practices (env vars, HTTPS, backups, key management). Bundled with this issue.

**When to implement H:** **as one of the first things** — ideally before (or alongside) the rest of the security baseline, and certainly before the chat and Phase 1–3 work. H depends on nothing in the app beyond the existing `pnpm` scripts. Having CodeQL, the lint/typecheck/test workflow, and Renovate in place means every subsequent PR is automatically scanned, linted, typechecked, and tested — a shift-left guardrail that hardens everything that follows. For a personal project this is the highest-leverage issue in the whole baseline.

## Configuration

New / updated env vars (validated by `src/lib/env.ts`):


- `ADMIN_USERNAME` — required. The admin's username. (Added by #53.)
- `ADMIN_PASSWORD_HASH` — required. Bcrypt hash of the admin's password. (Added by #53.)
- `SESSION_SECRET` — already required (min 32 chars). Used by #53.
- `SESSION_MAX_AGE` — optional, milliseconds. Session lifetime, **clamped to [1h, 30d]**, default **24h**. Sliding renewal on activity. Used by #53.
- `DOMAIN` — already present; used to derive the allowed Origin for the CSRF check and to set the CSP `connect-src` / `frame-ancestors` etc.

The security policy (CSP directives, rate-limit numbers, header values)
lives in `src/lib/security.config.ts`, reviewable in one place.

## Data Model Changes

One new column on `content_items` (migration):

```sql
ALTER TABLE content_items ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_content_is_hidden ON content_items(is_hidden);
```

No change to the `is_private` column — it already exists. The semantics of
`is_private` are tightened by this spec: it is now also AI-gated, not
just view-gated.

The FTS5 trigger (migration 0002) does not need to change — FTS indexes
the content; visibility is enforced at the query layer.

## Error Handling

Already partially in place (`errorResponse` helper, Zod, generic 500s,
server-side logs). The spec adds:

- Auth, CSRF, and security failures: **generic** messages to the client
  (e.g. `"Forbidden"`, `"Unauthorized"`); detailed info server-side and in
  `audit_logs`.
- Rate-limit responses: `429` + `Retry-After`; no internal details.
- Never echo DB errors, stack traces, or internal paths to the client.


## Testing

- **Middleware**:
  - Allow authenticated, deny unauthenticated (redirect vs `401`).
  - Security headers present on all responses.
  - CSRF origin check: same-origin POST allowed; cross-origin POST → `403`.
  - Rate limit: allow under threshold, `429` + `Retry-After` over threshold.
- **`is_hidden` / `is_private` query layer**:
  - `listWithFilters` / `findById` / `search.query` exclude hidden and private rows by default.
  - With `includeHidden` / `includePrivate` (authenticated), they are returned.
  - Unauthenticated requests cannot set `includeHidden` or `includePrivate` to `true` (forced `false` regardless of query string).
- **Security headers**: response header assertions.
- **CSRF**: cross-origin POST → `403`; same-origin allowed.
- **Rate limit**: burst then `429`.

- **No regression**: update existing `/api/items` tests to authenticate (session cookie) since #53 will require it. Add a test helper for authenticated requests (e.g. `createAuthedRequest`).

## Decomposition into Issues

**#53 (in flight)** stays as the foundation. This spec spawns **5 new
issues** plus a small chat-spec amendment:

| Issue | Scope |
|---|---|
| **#53** (in flight) | Session auth (login, session, middleware skeleton, password hashing, **constant-time login**, CSRF origin check, login rate limit, logout, audit) |
| **A** | Two-level visibility — migration adding `is_hidden`; `includeHidden` / `includePrivate` on read helpers; route plumbing; Zod schemas; tests |
| **B** | Security headers — middleware response headers via `security.config.ts` |
| **C** | Global rate limiting — `src/lib/rate-limit.ts` token bucket + middleware application |
| **D** | CORS hardening + security config — same-origin only, explicit deny, centralized `security.config.ts` |
| **E** | Security test suite — middleware + visibility + headers + CSRF + rate-limit tests; update existing tests to authenticate |

| **G** | **SSRF protection for URL-fetch endpoints** — shared `validateFetchUrl(url)` helper used by #17 and #44: block private/loopback/link-local; DNS resolve + IP check; block redirects to private; timeout + size limits; tests |
| **H** | **CI security** — CodeQL workflow, lint/typecheck/test workflow, Renovate config (with `minimumReleaseAge`), `SECURITY.md` |
| **—** | **Chat-spec amendment** — RAG includes `is_hidden` by default; includes `is_private` only on per-thread opt-in (new `chat_threads` column + per-send override); amend `docs/superpowers/specs/2026-06-19-chat-interface-design.md` and issue #49 |

A **one-line refinement to #53**: specify that CSRF uses **origin check**
(not double-submit token) to align with §3.

## Dependencies & Ordering

- **H (CI security) should land as one of the first things** — it
  depends on nothing in the app beyond the existing `pnpm` scripts.
  Putting CodeQL, the lint/typecheck/test workflow, and Renovate in
  place *before* the rest of the security baseline (and the chat and
  Phase 1–3 work) means every subsequent PR is automatically scanned,
  linted, typechecked, and tested — a shift-left guardrail that
  hardens everything that follows. For a personal project this is
  the highest-leverage issue in the whole baseline.
- **#53** lands alongside or just after H (creates the middleware
  skeleton, the `isAuthenticated` helper, session handling). Once
  #53 is in, H's CI workflow is already scanning it.
- **A, B, C, D, G** are independent of each other and can ship in
  parallel after #53. (G is used by #17 and #44 so it should land before
  them; otherwise A–G are orthogonal.)
- **E** (tests) last; integrates everything.
- **Chat-spec amendment + `chat_threads` column** can ship alongside the
  Chat track issues (#48 / #49), independent of A–G.

## Out of Scope / Future Work

- **HTTPS / TLS at nginx** — separate deployment-security spec. The HSTS header is set in this spec but is only meaningful when the app is served over HTTPS.
- **Full-disk encryption** — declined for v1.
- **Backup encryption** — handled separately. The database is backed up regularly to Proton Drive (end-to-end encrypted by Proton Drive itself); the backup procedure is documented in the backup reminder spec and the in-app `/backup` guide.
- **Secrets rotation** — env-level rotation, not in scope.
- **Multi-user / roles** — single-user per `docs/vision.md`.
- **Proton Pass / `pass-cli` integration** — future. A `pass-cli` bridge tool would let the chat AI fetch credentials / secrets from Proton Pass on demand (via a model tool call) so secrets never need to live in the ShadowBrain DB. Tracked as future work; no v1 issue.
- **Backup reminder / database rotation** — the periodic backup reminder (spec + in-app guide) replaces the at-rest encryption concern; an automated backup-rotation flow is a future enhancement.

## Cross-Spec Impact

- **`docs/superpowers/specs/2026-06-19-chat-interface-design.md`** §Components `retrieval.ts` currently says *"RAG excludes `is_private` by default."* That is updated to:
  - Include `is_hidden` items in the RAG context by default (they are AI-OK).
  - Exclude `is_private` items unless the current thread / message has opted in via a new per-thread / per-send **"Include private in AI"** control.
  - The control is a new column on `chat_threads` (default `0` / off) plus a per-send override in the chat UI.
- This is a small spec amendment and a small addition to the chat persistence migration (#48). It does not block the app-security baseline issues; it ships alongside the Chat track.

## Open Questions


- **Trusted-proxy / `X-Forwarded-For`**: the rate-limit module reads the real IP from a configured header. The production nginx config must set the header and the app must trust it. The exact nginx hardening is a deployment-security follow-up.

