import { z } from "zod";

const backupGuideConfigSchema = z.object({
  BACKUP_DOCKER_VOLUME: z.string().trim().min(1),
  BACKUP_TMP_DIR: z.string().trim().min(1),
  BACKUP_PROTON_FOLDER: z.string().trim().min(1),
});

export interface BackupGuideConfig {
  dockerVolume: string;
  tmpDir: string;
  protonFolder: string;
}

export type BackupGuideConfigResult =
  { ok: true; config: BackupGuideConfig } | { ok: false; errors: string[] };

function toConfig(
  raw: z.infer<typeof backupGuideConfigSchema>
): BackupGuideConfig {
  return {
    dockerVolume: raw.BACKUP_DOCKER_VOLUME,
    tmpDir: raw.BACKUP_TMP_DIR,
    protonFolder: raw.BACKUP_PROTON_FOLDER,
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function normalizeProtonFolder(folder: string): string {
  return folder.endsWith("/") ? folder : `${folder}/`;
}

export function readBackupGuideConfig(
  env: Record<string, string | undefined> = process.env
): BackupGuideConfigResult {
  const parsed = backupGuideConfigSchema.safeParse(env);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const key = issue.path.join(".");
        return `${key}: ${issue.message}`;
      }),
    };
  }
  return { ok: true, config: toConfig(parsed.data) };
}

export function buildBackupScript(config: BackupGuideConfig): string {
  const protonFolder = normalizeProtonFolder(config.protonFolder);
  return `#!/usr/bin/env bash
# ShadowBrain backup to Proton Drive. Run on the VPS.
# Requires: proton-drive CLI on PATH; docker on PATH.
set -euo pipefail

# === 1. Login ===
# Prints a URL — open it in your browser to authenticate.
# Session is held in memory; cleared by \`auth logout\` below.
proton-drive auth login

# === 2. Snapshot the data volume (DB + future images) ===
DATE="$(date +%F)"
SNAPSHOT_NAME="shadowbrain-backup-$DATE.tar.gz"
SNAPSHOT_DIR=${shellQuote(config.tmpDir)}
SNAPSHOT="$SNAPSHOT_DIR/$SNAPSHOT_NAME"
docker run --rm \\
  -v ${shellQuote(config.dockerVolume)}:/data:ro \\
  -v "$SNAPSHOT_DIR":/backup \\
  alpine tar czf "/backup/$SNAPSHOT_NAME" -C /data .

# === 3. Upload to Proton Drive ===
# First-time only: create the folder in the Proton Drive web UI
# (the CLI has no documented folder-create command).
proton-drive filesystem upload "$SNAPSHOT" ${shellQuote(protonFolder)}

# === 4. Verify ===
proton-drive filesystem list ${shellQuote(protonFolder)}

# === 5. Logout (clears the local session) ===
proton-drive auth logout

# === 6. Clean up the local snapshot (plaintext user data) ===
rm -f "$SNAPSHOT"

echo ""
echo "Backup complete. Return to ShadowBrain and click 'Mark as backed up'."`;
}
