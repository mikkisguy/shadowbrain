# Review Checklist

The pre-PR checklist. Walk through this before opening a PR — it covers the
obvious things. The deterministic chain in `pnpm verify` covers the rest; for
sensitive changes, the `@oracle` review pass (see the [Pull Request Workflow](pr-workflow.md))
covers the rest.

**Scope and shape**

- The diff is scoped to one issue. If scope grew, split it into a
  follow-up instead of mixing.
- No drive-by formatting churn unrelated to the change (run
  `pnpm format` and commit only what is necessary).
- No commented-out code, debug `console.log`s, or `TODO` left behind.

**Correctness**

- New behavior has at least one test. Bug fixes include a regression
  test that fails before the fix.
- Schema changes ship a new SQL migration in `src/db/migrations/`
  (never edit an applied migration — see Backend Guidelines).
- API changes have Zod schemas for input validation defined
  alongside the route handler.

**Security and policy**

- No secrets, tokens, or `.env` values in the diff. Confirm
  `git diff` output before committing.
- Security failures (401 / 403 / 429) return generic messages to the
  client; specific reasons are logged server-side and to
  `audit_logs`. See Backend Guidelines §Error Handling.
- New endpoints respect the rate-limit policy: auth endpoints
  ≈5 attempts / 15 min / IP, other API routes ≈120 req / min / IP,
  non-API routes ≈600 req / min / IP. See Backend Guidelines
  §Rate Limiting.

**Docs**

- `AGENTS.md` updated if a new convention, command, or workflow
  step was introduced.
- `CONTEXT.md` updated if a domain concept, table, or invariant
  changed.
- `docs/superpowers/specs/*.md` updated if a security,
  architectural, or removal-of-documented-API decision shifted.
- `package.json` `version` bumped per the [Versioning](../AGENTS.md#versioning)
  rules when the change adds, removes, or alters user-facing behavior.
- `README.md` shields.io version badge number updated to match `package.json`
  (the `[![Version](...)]` line in the header).
