"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  type BackupStatus,
  deriveBackupStatus,
  SNOOZE_DURATION_MS,
  BACKUP_SNOOZE_STORAGE_KEY,
} from "@/lib/backup/severity";

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

export function useBackupBanner(initialStatus: BackupStatus) {
  const pathname = usePathname();
  const isBackupPage = pathname === "/backup";

  const [status, setStatus] = useState<BackupStatus>(() =>
    deriveBackupStatus(initialStatus.lastBackupAt, initialStatus.snoozeCount)
  );
  // Defer client-only state until after hydration to avoid SSR mismatch.
  // The server cannot access localStorage or know the exact client time,
  // so we initialize to safe defaults and update in useEffect.
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  // Read client-only state after hydration to avoid SSR mismatch.
  // The server cannot access localStorage, so we defer until mounted.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSnoozedUntil(readStoredSnoozeUntil());
    setNow(Date.now());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  return {
    isBackupPage,
    severity,
    daysSince,
    isSnoozed,
    submitting,
    status,
    handleMark,
    handleSnooze,
  };
}
