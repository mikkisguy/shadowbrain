# Backup Reminder Completion (Issue #63) — Design

**Date:** 2026-07-01  
**Status:** Approved for implementation  
**Parent issue:** #63

## 1. Goal

Complete the remaining backup reminder feature surfaces so authenticated users are escalated from gentle reminders to a blocking final-stage modal, can run a copy-ready backup flow from `/backup`, and can mark completion through audited server routes.

## 2. Architecture

1. `src/app/layout.tsx` (server) reads `readBackupStatus(getDb())` for authenticated requests and passes `initialStatus` to `BackupReminderBanner`.
2. `src/components/backup/backup-reminder-banner.tsx` (client) uses the shared `Dialog` wrapper from `src/components/ui/dialog.tsx` and renders severity-specific UI from shared `deriveBackupStatus`.
3. `src/app/backup/page.tsx` (server) builds and passes a fully copy-ready script and backup context props to the guide component.
4. `src/app/backup/backup-guide.tsx` (client) renders instructions, script, copy action, troubleshooting, and `Mark as backed up`.
5. `src/components/ui/copy-button.tsx` provides reusable clipboard interaction and toast feedback.
6. Writes stay in existing server APIs:
   - `POST /api/backup` marks completion, resets snooze count, writes audit log.
   - `POST /api/backup/snooze` increments persistent snooze count.

## 3. UX and behavior

1. **Enforce stage is blocking final reminder** on non-`/backup` routes.
2. Enforce dialog is non-dismissible (no close button, no overlay-dismiss, no escape-dismiss).
3. On `/backup`, enforce state shows as inline warning instead of blocking dialog to keep the guide reachable.
4. Snooze remains available only while `snoozeCount < BACKUP_SNOOZE_LIMIT`.
5. `Mark as backed up` is always available and is the final escape once snooze limit is hit.

## 4. Strict `/backup` script policy

1. `/backup` is opinionated: script is prefilled with real deployment values.
2. No placeholders are shown in the primary script.
3. If required script inputs are missing/invalid, page renders explicit config error state and does not render a partial script.

## 5. Data flow and state

1. Server provides initial status via layout.
2. Banner re-derives severity on client from `lastBackupAt` + `snoozeCount` for long-open tabs.
3. Successful `POST /api/backup` response updates local status and clears local snooze timer.
4. Enforce snooze triggers `POST /api/backup/snooze` and updates status from server response.

## 6. Error handling

1. Client operations show user-safe error toasts on network/server failure.
2. Routes keep existing generic error responses and server-side logging/audit behavior.
3. `/backup` strict-config failures are explicit and actionable, not silent fallback content.

## 7. Testing and delivery gates

1. Add tests for banner enforce behavior and `/backup` server/client rendering paths.
2. Keep existing backup API and severity tests passing.
3. Bump version:
   - `package.json`: `0.19.0` → `0.20.0`
   - README version badge in lockstep.
4. Add AGENTS.md note documenting backup reminder behavior and strict `/backup` script policy.
5. Run `pnpm verify`.
6. Run required `@oracle` security review for auth/DB/audit touches and record results.

## 8. Out of scope

1. Building an audit log viewer UI.
2. Automated Proton Drive scheduling/rotation beyond current manual flow.
3. Changing existing backup escalation thresholds.
