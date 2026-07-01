"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type BackupStatus,
  type BackupSeverity,
  deriveBackupStatus,
  formatBackupAge,
  BACKUP_SNOOZE_LIMIT,
  SNOOZE_DURATION_MS,
  BACKUP_SNOOZE_STORAGE_KEY,
} from "@/lib/backup/severity";

interface BackupReminderBannerProps {
  initialStatus: BackupStatus;
}

function readStoredSnoozeUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(BACKUP_SNOOZE_STORAGE_KEY);
    if (!stored) return null;
    const ts = parseInt(stored, 10);
    if (Number.isFinite(ts) && ts > Date.now()) return ts;
    localStorage.removeItem(BACKUP_SNOOZE_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function getSeverityColor(severity: Exclude<BackupSeverity, "hidden">): {
  bg: string;
  border: string;
  text: string;
  accent: string;
} {
  switch (severity) {
    case "gentle":
      return {
        bg: "bg-surface-elevated",
        border: "border-border",
        text: "text-muted-foreground",
        accent: "text-muted-foreground",
      };
    case "prominent":
      return {
        bg: "bg-warning/5",
        border: "border-warning/40",
        text: "text-warning",
        accent: "text-warning",
      };
    case "enforce":
      return {
        bg: "bg-error/5",
        border: "border-error/40",
        text: "text-error",
        accent: "text-error",
      };
  }
}

export function BackupReminderBanner({
  initialStatus,
}: BackupReminderBannerProps) {
  const pathname = usePathname();
  const isBackupPage = pathname === "/backup";

  // Derive live severity from the server-provided initialStatus
  const [status, setStatus] = useState<BackupStatus>(() =>
    deriveBackupStatus(initialStatus.lastBackupAt, initialStatus.snoozeCount)
  );
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() =>
    readStoredSnoozeUntil()
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  // Keep the wall clock fresh for snooze-expiry checks in long-open tabs.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Recompute live severity on each render so long-open tabs stay accurate
  const liveStatus = deriveBackupStatus(
    status.lastBackupAt,
    status.snoozeCount
  );
  const severity = liveStatus.severity;
  const daysSince = liveStatus.daysSince;

  // Hidden while snoozed
  const isSnoozed = snoozedUntil !== null && now < snoozedUntil;

  async function handleMark() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Request failed");
      const newStatus = await res.json();
      setStatus(newStatus);
      setSnoozedUntil(null);
      try {
        localStorage.removeItem(BACKUP_SNOOZE_STORAGE_KEY);
      } catch {
        // ignore
      }
      toast.success("Marked as backed up.");
    } catch {
      toast.error("Couldn't update backup status. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSnooze() {
    const until = now + SNOOZE_DURATION_MS;
    setSnoozedUntil(until);
    try {
      localStorage.setItem(BACKUP_SNOOZE_STORAGE_KEY, String(until));
    } catch {
      // ignore
    }

    // At enforce severity, also hit the server to increment the persistent count
    if (severity === "enforce") {
      setSubmitting(true);
      try {
        const res = await fetch("/api/backup/snooze", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Request failed");
        const newStatus = await res.json();
        setStatus(newStatus);
      } catch {
        toast.error("Couldn't record snooze. Try again.");
      } finally {
        setSubmitting(false);
      }
    }
  }

  if (isSnoozed || severity === "hidden") return null;

  // On the /backup guide page, never show the blocking interstitial.
  // Render an inline banner instead so the user can read the guide.
  if (isBackupPage && severity === "enforce") {
    const colors = getSeverityColor("prominent");
    return (
      <div
        className={cn(
          "relative flex items-center justify-between gap-4 rounded-sm p-4",
          colors.bg,
          colors.border,
          "border-l-4"
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <AlertCircle
            className={cn("mt-0.5 size-5 shrink-0", colors.accent)}
          />
          <div className="min-w-0">
            <p className={cn("font-sans text-sm font-medium", colors.text)}>
              Last backup was {formatBackupAge(daysSince)} — backup is overdue.
            </p>
            <p className="text-muted-foreground mt-1 font-sans text-xs">
              Run the backup script from this page, then click &quot;Mark as
              backed up&quot; below.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/backup">
            <Button variant="ghost" size="sm">
              Open backup guide
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSnooze}
            disabled={submitting}
          >
            Snooze 1 day
          </Button>
          <Button
            variant="inverted"
            size="sm"
            mono
            onClick={handleMark}
            disabled={submitting}
          >
            Mark as backed up
          </Button>
        </div>
      </div>
    );
  }

  // Gentle severity: dismissible inline bar
  if (severity === "gentle") {
    const colors = getSeverityColor("gentle");
    return (
      <div
        className={cn(
          "relative flex flex-wrap items-center justify-between gap-4 rounded-sm p-3",
          colors.bg,
          colors.border
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <HardDrive className={cn("size-4 shrink-0", colors.accent)} />
          <p className={cn("font-sans text-sm", colors.text)}>
            Last backup {formatBackupAge(daysSince)}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/backup">
            <Button
              variant="link"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              Backup guide
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSnooze}
            disabled={submitting}
          >
            Remind me tomorrow
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleMark}
            disabled={submitting}
          >
            Mark as backed up
          </Button>
        </div>
      </div>
    );
  }

  // Prominent severity: inline banner with warning styling
  if (severity === "prominent") {
    const colors = getSeverityColor("prominent");
    return (
      <div
        className={cn(
          "relative flex flex-wrap items-center justify-between gap-4 rounded-sm border-l-4 p-4",
          colors.bg,
          colors.border
        )}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <AlertCircle
            className={cn("mt-0.5 size-5 shrink-0", colors.accent)}
          />
          <div className="min-w-0">
            <p className={cn("font-sans text-sm font-medium", colors.text)}>
              Last backup was {formatBackupAge(daysSince)} — back up soon.
            </p>
            <p className="text-muted-foreground mt-1 font-sans text-xs">
              Your SQLite database is the only copy of your data. Run a Proton
              Drive backup this week to avoid data loss.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/backup">
            <Button variant="ghost" size="sm">
              Backup guide
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSnooze}
            disabled={submitting}
          >
            Snooze 1 day
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMark}
            disabled={submitting}
          >
            Mark as backed up
          </Button>
        </div>
      </div>
    );
  }

  // Enforce severity: full-screen blocking dialog (non-dismissible)
  if (severity === "enforce") {
    const hideSnooze = status.snoozeCount >= BACKUP_SNOOZE_LIMIT;

    return (
      <Dialog
        open={true}
        disablePointerDismissal
        onOpenChange={(open, eventDetails) => {
          if (!open) eventDetails.cancel();
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-error flex items-center gap-2">
              <AlertCircle className="size-5" />
              Back up your data
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-sm">
            <span className="mb-3 block">
              It has been <strong>{formatBackupAge(daysSince)}</strong> since
              your last backup.
            </span>
            <span className="block">
              Your SQLite database is the <strong>only copy</strong> of your
              bookmarks, notes, and journal entries. It lives unencrypted on
              this server. Without a recent Proton Drive backup, a disk failure
              or VPS incident means permanent data loss.
            </span>
            {hideSnooze && (
              <span className="text-error mt-3 block font-medium">
                You have snoozed {BACKUP_SNOOZE_LIMIT} times — please run a
                backup now.
              </span>
            )}
          </DialogDescription>
          <DialogFooter className="flex-col gap-3">
            <Button
              variant="inverted"
              mono
              size="default"
              className="w-full"
              onClick={handleMark}
              disabled={submitting}
            >
              Mark as backed up
            </Button>
            {!hideSnooze && (
              <Button
                variant="outline"
                size="default"
                className="w-full"
                onClick={handleSnooze}
                disabled={submitting}
              >
                Snooze 1 day
              </Button>
            )}
            <Link href="/backup">
              <Button variant="ghost" size="default" className="w-full">
                Open the backup guide
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
