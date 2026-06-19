# Periodic Backup Reminder — Design

**Date:** 2026-06-19
**Status:** Approved
**Parent issue:** #41 (Roadmap)

## Overview

The ShadowBrain SQLite database is the single source of truth for user content. It must be backed up regularly to a secure destination. The backup destination is **Proton Drive** (end-to-end encrypted by design; the operator already has an account).

The database is *not* encrypted at rest by the application — there is no SQLCipher and no application-layer envelope. Such layers collapse to zero protection when the encryption key is co-located with the database on the same host (a realistic assumption for a personal VPS), and they add operational risk (forget the key = lose the DB). The defense is instead: **(1) regular backups to Proton Drive** (this spec), and **(2) a reminder system that escalates over time** to ensure backups actually happen.

This spec covers both the backup *mechanism* (the shell script the operator runs on the VPS) and the in-app *reminder* (the banner, the escalation curve, the "Mark as backed up" button, the `/backup` guide page).

## 1. What gets backed up

The entire `shadowbrain_data` Docker volume, snapshotted to a `tar.gz` in `/tmp`, then uploaded to Proton Drive. The volume contains:

- The SQLite database (`shadowbrain.prod.db`).
- User-uploaded images (`data/images/...`) once the image-capture work from Phase 1.12 and 2.6 lands. Currently zero images exist; backing up the whole volume is future-proof and avoids a guide rewrite when image support ships.

Backing up the volume (not just the DB file) is a single command and covers both the current state and the future state.

### Snapshot consistency note

`tar` of a live SQLite database with WAL mode can occasionally capture a write in progress. For a weekly personal backup the consequence is negligible (the next backup catches the missing writes). For a fully consistent snapshot, replace the `tar` step with `sqlite3 .backup`. The guide documents the `tar` default and notes the `.backup` alternative as a one-line swap.

## 2. Backup method — the shell script

The operator runs the following script on the VPS (as the user that owns the `shadowbrain_data` volume). The in-app `/backup` page renders it as a code block with a Copy button.

```bash
#!/usr/bin/env bash
# ShadowBrain backup to Proton Drive. Run on the VPS.
# Requires: proton-drive CLI on PATH; docker on PATH.
set -euo pipefail

# === 1. Login ===
# Prints a URL — open it in your browser to authenticate.
# Session is held in memory; cleared by `auth logout` below.
proton-drive auth login

# === 2. Snapshot the data volume (DB + future images) ===
SNAPSHOT="/tmp/shadowbrain-backup-$(date +%F).tar.gz"
docker run --rm \
  -v shadowbrain_data:/data:ro \
  -v /tmp:/backup \
  alpine tar czf "/backup/shadowbrain-backup-$(date +%F).tar.gz" -C /data .

# === 3. Upload to Proton Drive ===
# First-time only: create the folder "/ShadowBrain Backups" in the
# Proton Drive web UI (the CLI has no documented folder-create command).
proton-drive filesystem upload "$SNAPSHOT" "/ShadowBrain Backups/"

# === 4. Verify ===
proton-drive filesystem list "/ShadowBrain Backups/"

# === 5. Logout (clears the local session) ===
proton-drive auth logout

# === 6. Clean up the local snapshot (plaintext user data) ===
rm -f "$SNAPSHOT"

echo ""
echo "Backup complete. Return to ShadowBrain and click 'Mark as backed up'."
```

The script uses the **Proton Drive CLI's link-based auth** (the CLI prints a URL, the operator opens it in their browser on the laptop). The session is ephemeral — login at backup time, upload, logout — so the VPS never holds a persistent Proton Drive credential. This sidesteps the CLI's OS-secret-store requirement (no persistent keyring is needed on the headless VPS; the session lives in memory only and is cleared by `auth logout`).

## 3. Reminder tracking

A new row in the `settings` table (the table is plaintext; this is metadata, not a secret):

- **Key:** `last_backup_at` — ISO 8601 timestamp (e.g. `2026-06-19T14:30:00Z`), or empty/missing if never backed up.
- **Key:** `backup_snooze_count` — integer count of consecutive snoozes at the 14+ day severity; reset to 0 on a successful "Mark as backed up".

Written by the "Mark as backed up" button (see §5). The `last_backup_at` is read on every authenticated page load to compute the banner severity.

## 4. Escalation curve

On every authenticated page load, a banner in the root layout computes `daysSince = now - last_backup_at` (treating missing/empty as "never" → 14+) and renders one of three severities:

| Days since last backup | Severity | UI |
|---|---|---|
| 0–6 | Gentle | Dismissible for 1 day. Muted color. |
| 7–13 | Prominent | Non-dismissible. Only "Mark as backed up" or "Snooze 1 day". Warning color. |
| 14+ | Enforce | Full-screen interstitial blocking the app. "Mark as backed up" or "Snooze 1 day". After 3 consecutive snoozes at this level (tracked via `backup_snooze_count`), the snooze button disappears — "Mark as backed up" is the only escape. Error color. |

The "Snooze 1 day" action does **not** update `last_backup_at`; it increments `backup_snooze_count` (at the 14+ level) and visually pushes the perceived timestamp back by 1 day. A successful "Mark as backed up" resets the count to 0.

## 5. "Mark as backed up" button

Available from:

- The reminder banner (at every severity level, as the only escape at 14+ after 3 snoozes).
- The `/backup` guide page (as a confirmation after the operator has run the script).

Behavior on click:

1. Writes `last_backup_at = now` to the `settings` table.
2. Resets `backup_snooze_count` to 0.
3. Writes an `audit_logs` row: `action: "backup.marked"`, `entity_type: "settings"`, `entity_id: "last_backup_at"`, `metadata: { last_backup_at: <iso> }`, `actor_type: "user"`, `actor_id: <session user id>`.
4. The banner updates immediately to reflect the new timestamp.

No confirmation modal — the button is the confirmation.

## 6. Audit

The `backup.marked` event is written to `audit_logs` as described in §5.

**Known limitation:** ShadowBrain currently has **no UI to view `audit_logs` entries** (the read-side of the table is entirely unimplemented — no `auditLogs.list()` helper, no `/api/audit-logs` route, no admin page). The reminder banner itself shows the current state, so the audit log is for historical record only. Surfacing audit logs to the user is a separate, broader feature tracked by the **"Observability: audit log viewer (admin UI or CLI)"** issue in the roadmap.

## 7. The `/backup` guide page

A new authenticated page at `/backup` (App Router) containing:

1. **Why back up?** — one paragraph: the DB is the only state; Proton Drive is the E2E-encrypted destination; the reminder system exists to make sure it actually happens.
2. **The script** — the shell script from §2, rendered as a code block with a Copy button, and a "One-time setup" callout (create the `/ShadowBrain Backups` folder in Proton Drive via the web UI).
3. **The "Mark as backed up" button** — so the operator can confirm from the same page after running the script.
4. **Troubleshooting** — brief notes: the ephemeral login/upload/logout pattern should avoid the CLI's OS-secret-store requirement; for a fully consistent DB snapshot, swap `tar` for `sqlite3 .backup`; the `/tmp` snapshot is plaintext user data and is removed by the script at the end.

## 8. Security & threat model

- **Primary secret store:** Proton Pass. Catastrophic secrets (passwords for other services, tokens) never live in ShadowBrain's DB or `.env`.
- **DB at rest:** plaintext SQLite on the VPS. Protected by host access controls and by regular backups to Proton Drive. No application-layer encryption (no SQLCipher, no field-level envelope) — such layers collapse to zero protection when the key is co-located with the data on the same host, and add operational risk (forget the key = lose the DB).
- **Backup at rest:** Proton Drive is E2E encrypted. A stolen Proton Drive backup is unreadable without the operator's Proton account credentials.
- **`last_backup_at` / `backup_snooze_count`:** metadata, not secrets; stored as plaintext in the `settings` table. Acceptable.
- **`audit_logs.backup.marked` event:** contains the timestamp, not the backup contents. Acceptable.
- **The VPS holds no persistent Proton Drive credential** (ephemeral login/upload/logout). The snapshot tarball in `/tmp` is plaintext user data, removed by the script at the end; the script's `rm` is the mitigation.

## 9. Decomposition

One issue:

| Issue | Title | Scope |
|---|---|---|
| (new) | Security/ops: periodic backup reminder with Proton Drive CLI guide | The full feature: `last_backup_at` + `backup_snooze_count` tracking, the reminder banner with the three-level escalation curve, the `/backup` guide page, the "Mark as backed up" button + audit event, the snooze tracking, the keyboard/screen-reader accessibility for all three severities. |

## 10. Out of scope

- **Audit log viewer (admin UI or CLI).** A separate roadmap issue. The backup feature writes to `audit_logs` but the user cannot view those entries in the web UI today; this is a known limitation, not a blocker for the backup feature.
- **Automated backup from the VPS.** The Proton Drive CLI requires browser-based auth and an OS secret store, neither of which is suitable for a headless Docker container. Manual backup from the VPS via the CLI (with link-based auth in the operator's browser) is the right pattern. Integration with Proton Drive's server-side API is not available to third-party apps.
- **Field-level encryption of the `settings` table** (e.g., wrapping API key values). Out of scope by design; see the App Security Baseline spec §Overview for the threat model.
- **Backup rotation / retention policies on the Proton Drive side.** The operator manages retention via Proton Drive's web UI.
- **Forcing the operator to log out of the ShadowBrain web session after backup.** The script's `proton-drive auth logout` is the security-relevant action; the web session is unrelated to the backup and forcing a logout would add friction without benefit.

## References

- App Security Baseline spec: `docs/superpowers/specs/2026-06-19-app-security-baseline-design.md` (cross-references this spec for the backup posture; the dropped §7 SQLCipher is replaced by the regular-backup mechanism described here).
- Proton Drive CLI: https://github.com/ProtonDriveApps/sdk/blob/main/js/cli/README.md
- Roadmap: #41
- Supersedes: #59 (SQLCipher) — closed as wontfix; this spec replaces the at-rest encryption concern with a regular-backup posture.
