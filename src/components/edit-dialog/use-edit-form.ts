"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ContentItem } from "@/db/index";
import { queryKeys } from "@/lib/query-config";
import { draftToMetadata } from "@/lib/add-form/metadata-helpers";
import { type EditDraft, draftsEqual } from "./draft-helpers";

interface UseEditFormParams {
  item: ContentItem;
  initialDraftRef: React.RefObject<EditDraft>;
  setDraft: React.Dispatch<React.SetStateAction<EditDraft>>;
  onHasChangesChange: (hasChanges: boolean) => void;
  onSaved?: () => void;
  onForceClose: () => void;
}

export function useEditForm({
  item,
  initialDraftRef,
  setDraft,
  onHasChangesChange,
  onSaved,
  onForceClose,
}: UseEditFormParams) {
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (draftToSubmit: EditDraft) => {
      const body: Record<string, unknown> = {};

      if (draftToSubmit.title !== initialDraftRef.current.title) {
        body.title = draftToSubmit.title || null;
      }
      if (draftToSubmit.content !== initialDraftRef.current.content) {
        body.content = draftToSubmit.content;
      }
      if (draftToSubmit.type !== initialDraftRef.current.type) {
        body.type = draftToSubmit.type;
      }
      if (draftToSubmit.source !== initialDraftRef.current.source) {
        body.source = draftToSubmit.source;
      }
      if (draftToSubmit.sourceUrl !== initialDraftRef.current.sourceUrl) {
        body.source_url = draftToSubmit.sourceUrl || null;
      }
      if (draftToSubmit.is_private !== initialDraftRef.current.is_private) {
        body.is_private = draftToSubmit.is_private;
      }
      if (draftToSubmit.is_hidden !== initialDraftRef.current.is_hidden) {
        body.is_hidden = draftToSubmit.is_hidden;
      }

      // Tags: always send if different.
      const initialTagsArr = initialDraftRef.current.tags;
      const currentTags = draftToSubmit.tags;
      const tagsChanged =
        initialTagsArr.length !== currentTags.length ||
        !initialTagsArr.every((t, i) => t === currentTags[i]);
      if (tagsChanged) {
        body.tags = currentTags;
      }

      // Metadata: build from type-specific fields and compare.
      const meta = draftToMetadata(draftToSubmit);
      const initialMeta = draftToMetadata(initialDraftRef.current);
      if (JSON.stringify(meta) !== JSON.stringify(initialMeta)) {
        body.metadata = meta ?? undefined;
      }

      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg: string | undefined = payload?.error?.message;
        throw new Error(msg ?? "Failed to save changes");
      }

      return res.json();
    },
    onSuccess: () => {
      if (!mountedRef.current) return;

      queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });

      onHasChangesChange(false);
      toast.success("Item updated.");
      onSaved?.();
      onForceClose();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to save changes");
    },
  });

  const updateField = useCallback(
    <K extends keyof EditDraft>(field: K, value: EditDraft[K]) => {
      setDraft((prev) => {
        const next = { ...prev, [field]: value };
        if (!draftsEqual(next, initialDraftRef.current)) {
          onHasChangesChange(true);
        } else {
          onHasChangesChange(false);
        }
        return next;
      });
      if (mutation.error) mutation.reset();
    },
    [mutation, onHasChangesChange, setDraft, initialDraftRef]
  );

  return { mutation, updateField };
}
