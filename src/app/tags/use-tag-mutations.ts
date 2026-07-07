"use client";

/**
 * Tag mutation hooks.
 *
 * Owns all five TanStack Query mutations the Tags page needs:
 * create, rename, delete, merge, and bulk-delete-unused. Each
 * mutation invalidates `queryKeys.tags.all` on success so the
 * tag list and its usage counts re-sync with the server.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-config";

import {
  createTag,
  deleteTag,
  deleteUnusedTags,
  mergeTag,
  renameTag,
} from "./api";

export function useTagMutations() {
  const queryClient = useQueryClient();

  const invalidateTags = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });

  const createTagMutation = useMutation({
    mutationFn: createTag,
    onSuccess: invalidateTags,
  });

  const renameTagMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameTag(id, name),
    onSuccess: invalidateTags,
  });

  const deleteTagMutation = useMutation({
    mutationFn: deleteTag,
    onSuccess: invalidateTags,
  });

  const mergeTagMutation = useMutation({
    mutationFn: ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }) => mergeTag(sourceId, targetId),
    onSuccess: invalidateTags,
  });

  const deleteUnusedMutation = useMutation({
    mutationFn: deleteUnusedTags,
    onSuccess: invalidateTags,
  });

  return {
    createTagMutation,
    renameTagMutation,
    deleteTagMutation,
    mergeTagMutation,
    deleteUnusedMutation,
  };
}
