"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { CelestialHeader } from "@/components/visual/celestial-motif";
import {
  deriveBackupStatus,
  formatBackupAge,
  type BackupStatus,
} from "@/lib/backup/severity";
import type { BackupGuideConfig } from "@/lib/backup/guide-config";
import { cn } from "@/lib/utils";

export interface BackupGuideProps {
  initialStatus: BackupStatus;
  backupScript: string;
  backupConfig: BackupGuideConfig;
}

export function BackupGuide({
  initialStatus,
  backupScript,
  backupConfig,
}: BackupGuideProps) {
  // State for the backup status
  const [status, setStatus] = React.useState<BackupStatus>(() =>
    deriveBackupStatus(initialStatus.lastBackupAt, initialStatus.snoozeCount)
  );

  // State for loading button
  const [submitting, setSubmitting] = React.useState(false);

  // Recompute the live status each render
  const liveStatus = React.useMemo(
    () => deriveBackupStatus(status.lastBackupAt, status.snoozeCount),
    [status.lastBackupAt, status.snoozeCount]
  );

  // Mark as backed up action
  const handleMark = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/backup", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to mark as backed up");
      }

      const newStatus: BackupStatus = await response.json();
      setStatus(newStatus);

      toast.success("Marked as backed up.");
    } catch {
      toast.error("Couldn't update backup status. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      id="main-content"
      data-testid="backup-guide"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="relative flex flex-col gap-3 overflow-hidden pb-2">
        <CelestialHeader headerShift={-15} />
        <p className="text-muted-foreground relative z-10 font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          Disaster recovery
        </p>
        <h1 className="text-foreground relative z-10 font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          Backup your data
        </h1>
      </header>

      {/* Status card */}
      <section
        className={cn(
          "flex flex-col gap-3 rounded-sm border p-4",
          liveStatus.severity === "hidden" || liveStatus.severity === "gentle"
            ? "border-border bg-surface-elevated"
            : liveStatus.severity === "prominent"
              ? "border-warning/40 bg-warning/5"
              : "border-error/40 bg-error/5"
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">
              Current status:{" "}
              <span
                className={cn(
                  "font-medium",
                  liveStatus.severity === "hidden" ||
                    liveStatus.severity === "gentle"
                    ? "text-muted-foreground"
                    : liveStatus.severity === "prominent"
                      ? "text-warning"
                      : "text-error"
                )}
              >
                {liveStatus.severity === "hidden" ||
                liveStatus.severity === "gentle"
                  ? "Up to date"
                  : liveStatus.severity === "prominent"
                    ? "Overdue"
                    : "Critical"}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              Last backup: {formatBackupAge(liveStatus.daysSince)}
            </p>
          </div>
          <Button
            variant="inverted"
            mono
            onClick={handleMark}
            disabled={submitting}
          >
            Mark as backed up
          </Button>
        </div>
      </section>

      {/* Why back up? */}
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-xl font-semibold">Why back up?</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          The SQLite database is the single source of truth for all your
          ShadowBrain content — notes, bookmarks, tags, and connections. It
          lives unencrypted on the server disk. Proton Drive is our
          end-to-end-encrypted backup destination. This reminder system exists
          to make sure backups actually happen, so you never lose your data.
        </p>
      </section>

      {/* The script */}
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-xl font-semibold">The backup script</h2>
        <div className="relative flex flex-col gap-2">
          <div className="flex justify-end">
            <CopyButton
              value={backupScript}
              label="Copy script"
              copiedLabel="Copied!"
            />
          </div>
          <pre
            className={cn(
              "overflow-x-auto rounded-sm border p-4 text-xs",
              "bg-surface-elevated border-border"
            )}
          >
            <code className="font-mono">{backupScript}</code>
          </pre>
        </div>

        {/* One-time setup callout */}
        <div className="border-warning/30 bg-warning/5 rounded-sm border p-4 text-sm">
          <p className="text-warning font-medium">One-time setup required</p>
          <p className="text-muted-foreground mt-1">
            Before the first backup, create a folder named{" "}
            <code className="bg-muted rounded-sm px-1 py-0.5 font-mono text-xs">
              {backupConfig.protonFolder}
            </code>{" "}
            in the Proton Drive web UI — the CLI has no folder-create command,
            so the upload step fails until the folder exists.
          </p>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-xl font-semibold">Troubleshooting</h2>
        <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
          <li>
            The script logs in via a browser link, uploads, then logs out — no
            Proton credential is stored on the server.
          </li>
          <li>
            The{" "}
            <code className="bg-muted rounded-sm px-1 py-0.5 font-mono text-xs">
              /tmp
            </code>{" "}
            snapshot tarball is plaintext user data; the script deletes it at
            the end.
          </li>
          <li>
            For a fully DB-consistent snapshot, swap the{" "}
            <code className="bg-muted rounded-sm px-1 py-0.5 font-mono text-xs">
              tar
            </code>{" "}
            step for{" "}
            <code className="bg-muted rounded-sm px-1 py-0.5 font-mono text-xs">
              sqlite3 .backup
            </code>
            .
          </li>
        </ul>
      </section>
    </main>
  );
}
