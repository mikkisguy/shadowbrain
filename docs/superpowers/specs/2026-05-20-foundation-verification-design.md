# Foundation Verification Design

## Overview

This spec covers the remaining work for Phase 0 issues #6 and #7: fail-fast
environment validation, expanded settings seeding, a lightweight foundation
verification script, and docs alignment for docker exposure and Phase 1 TODOs.

## Scope

- Add startup env validation with clear failure messaging.
- Gate Discord and AI features with explicit required env checks.
- Expand settings seeding to include OpenRouter/Discord values when appropriate.
- Add a `pnpm verify:foundation` script to validate migrations, FTS, and vector.
- Align docs to nginx exposure at `localhost:80` and add Phase 1 TODOs.

## Non-Goals

- Build new UI or API features beyond gating checks.
- Add heavy integration tests or CI pipelines.
- Change docker topology or add new containers.

## Approach

### Startup Env Validation

- Call `getEnv()` during app startup and terminate on validation failure.
- Missing required vars produce a single-line error listing missing keys and
  a reference to `.env.example`.
- Default behavior: require `SESSION_SECRET` at startup.

### Feature-Gated Env Checks

- Use `requireEnvVars()` in Discord and AI entry points.
- Missing optional vars block only the relevant feature and surface a concise
  server-side log and API error message.

### Settings Seeding

- Extend `seed-settings` to map any OpenRouter/Discord settings that should
  persist as defaults.
- Keep DB defaults in migrations as the fallback when env vars are absent.

### Foundation Verification Script

- Add `pnpm verify:foundation` to run a small Node script that:
  - Creates a temp DB and runs migrations.
  - Asserts `content_items` is empty.
  - Inserts one record and validates FTS returns it.
  - Verifies `content_vectors` when sqlite-vec is available.
- No network calls or external services.

### Docs Alignment

- Update Phase 0 deliverable notes to clarify nginx exposure at `localhost:80`.
- Add Phase 1 TODOs section in `docs/phases.md` if any are discovered.

## Error Handling

- Startup: fail fast with a clear, single-line message and non-zero exit code.
- Feature-gated checks: return concise errors to callers and log details.

## Testing and Validation

- Manual run: `pnpm verify:foundation` on a fresh checkout.
- Ensure no behavioral changes beyond env gating and validation.

## Rollout Notes

- No data migrations beyond existing SQL.
- Failure mode is explicit and immediate for missing required vars.
