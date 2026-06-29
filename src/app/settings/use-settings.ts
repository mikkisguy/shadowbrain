"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSettings } from "./api";
import type { SettingsDraft, SettingsSnapshot } from "./types";
import { snapshotToDraft } from "./types";

export type SettingsStatus = "loading" | "success" | "error";

export interface UseSettingsResult {
  saved: SettingsSnapshot | null;
  draft: SettingsDraft | null;
  status: SettingsStatus;
  error: string | null;
  clearedSecrets: Set<keyof SettingsDraft>;
  setDraft: React.Dispatch<React.SetStateAction<SettingsDraft | null>>;
  clearSecret: (key: keyof SettingsDraft) => void;
  applySaved: (snapshot: SettingsSnapshot) => void;
  refresh: () => void;
}

const LOAD_ERROR = "Couldn't load your settings right now. Please try again.";

export function useSettings(): UseSettingsResult {
  const [saved, setSaved] = useState<SettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [status, setStatus] = useState<SettingsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [clearedSecrets, setClearedSecrets] = useState<
    Set<keyof SettingsDraft>
  >(() => new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const versionRef = useRef(0);

  const applySaved = useCallback((snapshot: SettingsSnapshot) => {
    setSaved(snapshot);
    setDraft(snapshotToDraft(snapshot));
    setClearedSecrets(new Set());
  }, []);

  const refresh = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  const clearSecret = useCallback((key: keyof SettingsDraft) => {
    setDraft((prev) => (prev ? { ...prev, [key]: "" } : prev));
    setClearedSecrets((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    const version = versionRef.current + 1;
    versionRef.current = version;
    setStatus((prev) => (prev === "success" ? prev : "loading"));

    fetchSettings(controller.signal)
      .then((snapshot) => {
        if (versionRef.current !== version) return;
        applySaved(snapshot);
        setStatus("success");
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (versionRef.current !== version) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
        setError(LOAD_ERROR);
      });

    return () => controller.abort();
  }, [reloadToken, applySaved]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    saved,
    draft,
    status,
    error,
    clearedSecrets,
    setDraft,
    clearSecret,
    applySaved,
    refresh,
  };
}
