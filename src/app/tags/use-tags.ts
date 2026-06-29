"use client";

/**
 * Tags-list state hook.
 *
 * Owns the `GET /api/tags` lifecycle for the Tags page: the
 * accumulated list, the request status, and a `refresh` that
 * re-fetches (used after every create / rename / delete so the
 * list and its usage counts stay in sync with the server).
 *
 * Mutations themselves live in `api.ts` and are driven by the
 * dialogs — the hook deliberately does not wrap them, so each
 * dialog owns its own submit/loading state and only calls
 * `refresh()` once the mutation resolves.
 *
 * Each fetch cancels the previous in-flight request via
 * `AbortController` and ignores a superseded response, so a rapid
 * sequence of refreshes can never land an older list on top of a
 * newer one.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchTags } from "./api";
import type { TagWithCount } from "./types";

export type TagsStatus = "loading" | "success" | "error";

export interface UseTagsResult {
  /** The current tag list, as last returned by the server. */
  tags: TagWithCount[];
  /** Request lifecycle state. */
  status: TagsStatus;
  /** User-safe error message when `status === "error"`. */
  error: string | null;
  /** Re-fetch the list. Resolves once the request settles. */
  refresh: () => void;
}

const LOAD_ERROR = "Couldn't load your tags right now. Please try again.";

export function useTags(): UseTagsResult {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [status, setStatus] = useState<TagsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Version guard: every fetch captures the current version; only the
  // latest fetch is allowed to commit its result.
  const versionRef = useRef(0);

  const refresh = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    const version = versionRef.current + 1;
    versionRef.current = version;
    setStatus((prev) => (prev === "success" ? prev : "loading"));

    fetchTags(controller.signal)
      .then((rows) => {
        if (versionRef.current !== version) return;
        setTags(rows);
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
  }, [reloadToken]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { tags, status, error, refresh };
}
