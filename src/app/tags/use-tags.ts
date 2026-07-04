"use client";

/**
 * Tags-list state hook.
 *
 * Owns the `GET /api/tags` lifecycle for the Tags page via TanStack
 * Query. Returns the accumulated list, the request status, and a
 * `refresh` that re-fetches the list.
 *
 * Mutations live in `tags-page.tsx` — this hook only handles reads.
 * Each mutation invalidates `queryKeys.tags.all` on success so the
 * list and its usage counts stay in sync with the server.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { queryKeys, staleTimes } from "@/lib/query-config";

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
  const {
    data,
    status: queryStatus,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tags.list,
    queryFn: ({ signal }) => fetchTags(signal),
    staleTime: staleTimes.tags,
  });

  const status: TagsStatus =
    queryStatus === "pending"
      ? "loading"
      : queryStatus === "error"
        ? "error"
        : "success";

  const error = queryError ? LOAD_ERROR : null;

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return { tags: data ?? [], status, error, refresh };
}
