"use client";

import Link from "next/link";
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
  formatBackupAge,
  BACKUP_SNOOZE_LIMIT,
} from "@/lib/backup/severity";
import { useBackupBanner } from "./use-backup-banner";
import { getSeverityColor } from "./backup-banner-styles";

interface BackupReminderBannerProps {
  initialStatus: BackupStatus;
}

export function BackupReminderBanner({
  initialStatus,
}: BackupReminderBannerProps) {
  const {
    isBackupPage,
    severity,
    daysSince,
    isSnoozed,
    submitting,
    status,
    handleMark,
    handleSnooze,
  } = useBackupBanner(initialStatus);

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
          <Button render={<Link href="/backup" />} variant="ghost" size="sm">
            Open backup guide
          </Button>
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
          <Button
            render={<Link href="/backup" />}
            variant="link"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            Backup guide
          </Button>
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
          <Button render={<Link href="/backup" />} variant="ghost" size="sm">
            Backup guide
          </Button>
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
          className="max-h-[90vh] max-w-lg overflow-y-auto sm:min-w-[20rem]"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-error flex items-center gap-2">
              <AlertCircle className="size-5" />
              Back up your data
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-sm break-words">
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
          <DialogFooter className="flex-col gap-3 sm:flex-col">
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
            <Button
              render={<Link href="/backup" />}
              variant="ghost"
              size="default"
              className="w-full"
            >
              Open the backup guide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
