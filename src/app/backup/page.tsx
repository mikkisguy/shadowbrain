import { getDb } from "@/db/index";
import { readBackupStatus } from "@/lib/backup/reminder";
import {
  buildBackupScript,
  readBackupGuideConfig,
} from "@/lib/backup/guide-config";
import { BackupGuide } from "./backup-guide";

export const metadata = {
  title: "Backup · ShadowBrain",
};

export default function BackupPage() {
  const status = readBackupStatus(getDb());
  const config = readBackupGuideConfig();

  if (!config.ok) {
    return (
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-screen-md flex-col gap-4 px-4 py-8 sm:px-6 sm:py-12"
      >
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          Backup guide is misconfigured
        </h1>
        <p className="text-muted-foreground text-sm">
          This page requires backup config values from the environment and
          cannot render a partial script.
        </p>
        <div className="border-error/40 bg-error/5 rounded-sm border p-4">
          <p className="text-error font-medium">
            Missing or invalid configuration
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
            {config.errors.map((error) => (
              <li key={error}>
                <code className="font-mono text-xs">{error}</code>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-3 text-xs">
            Set <code className="font-mono">BACKUP_DOCKER_VOLUME</code>,{" "}
            <code className="font-mono">BACKUP_TMP_DIR</code>, and{" "}
            <code className="font-mono">BACKUP_PROTON_FOLDER</code> in your
            environment.
          </p>
        </div>
      </main>
    );
  }

  return (
    <BackupGuide
      initialStatus={status}
      backupScript={buildBackupScript(config.config)}
      backupConfig={config.config}
    />
  );
}
