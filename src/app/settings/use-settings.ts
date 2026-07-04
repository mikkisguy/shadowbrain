"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchSettings } from "./api";
import { queryKeys, staleTimes } from "@/lib/query-config";
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
  /**
   * Increments on every `applySaved` (initial load, save, discard).
   * Consumers use it as a remount `key` for components whose local
   * state must re-initialise against the fresh snapshot — e.g.
   * `SecretInput`, whose "configured vs editing" view depends on the
   * post-save `isSet` flag.
   */
  savedVersion: number;
}

const LOAD_ERROR = "Couldn't load your settings right now. Please try again.";

export function useSettings(): UseSettingsResult {
  const [saved, setSaved] = useState<SettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [clearedSecrets, setClearedSecrets] = useState<
    Set<keyof SettingsDraft>
  >(() => new Set());
  const [savedVersion, setSavedVersion] = useState(0);

  const applySaved = useCallback((snapshot: SettingsSnapshot) => {
    setSaved(snapshot);
    setDraft(snapshotToDraft(snapshot));
    setClearedSecrets(new Set());
    setSavedVersion((v) => v + 1);
  }, []);

  const {
    data,
    status: queryStatus,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.settings.current,
    queryFn: ({ signal }) => fetchSettings(signal),
    staleTime: staleTimes.settings,
    refetchOnWindowFocus: false,
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (queryStatus === "success" && data) {
      applySaved(data);
    }
  }, [data, queryStatus, applySaved]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const clearSecret = useCallback((key: keyof SettingsDraft) => {
    setDraft((prev) => (prev ? { ...prev, [key]: "" } : prev));
    setClearedSecrets((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const mappedStatus: SettingsStatus =
    queryStatus === "pending"
      ? "loading"
      : queryStatus === "error"
        ? "error"
        : "success";

  return {
    saved,
    draft,
    status: mappedStatus,
    error: queryError ? LOAD_ERROR : null,
    clearedSecrets,
    setDraft,
    clearSecret,
    applySaved,
    refresh,
    savedVersion,
  };
}
