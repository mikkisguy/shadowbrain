"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-config";
import type { BookmarkMetadata } from "@/lib/metadata-fetcher";
import { useDraftPersistence } from "@/lib/add-form/use-draft-persistence";
import { draftToMetadata } from "@/lib/add-form/metadata-helpers";
import { uploadImage } from "@/lib/add-form/upload-image";
import {
  type Draft,
  emptyDraft,
  isContentRequired,
  resolveContent,
  canSubmit,
} from "@/lib/add-form/types";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAddFormOptions {
  onClose: () => void;
}

export function useAddForm({ onClose }: UseAddFormOptions) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { clearDraft } = useDraftPersistence(draft, setDraft);
  const mountedRef = useRef(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ---- Bookmark preview state ----
  const [previewMetadata, setPreviewMetadata] =
    useState<BookmarkMetadata | null>(null);

  const handleMetadataFetched = useCallback(
    (metadata: BookmarkMetadata | null) => {
      setPreviewMetadata(metadata);
    },
    []
  );

  const handleTitlePrefill = useCallback((title: string) => {
    setDraft((prev) => {
      if (!prev.title.trim()) return { ...prev, title };
      return prev;
    });
  }, []);

  // Clear image state when type changes. Must be declared before
  // handleTypeChange which references it.
  const clearSelectedFile = useCallback(() => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  const handleTypeChange = useCallback(
    (v: string | null) => {
      if (!v) return;
      setDraft((prev) => ({ ...prev, type: v }));
      if (v !== "bookmark") {
        setPreviewMetadata(null);
      }
      if (v !== "image") {
        clearSelectedFile();
      }
    },
    [clearSelectedFile]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      contentRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- File handlers ----

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  // Clipboard paste handler for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item?.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFile(file);
          return;
        }
      }
    },
    [handleFile]
  );

  // ---- canSubmit override for images ----
  const canSubmitImage =
    draft.type === "image"
      ? selectedFile !== null || draft.imageUrl.trim().length > 0
      : canSubmit(draft);

  // ---- Mutation ----
  const mutation = useMutation({
    mutationFn: async (draftToSubmit: Draft) => {
      if (draftToSubmit.type === "image") {
        if (selectedFile) {
          return uploadImage(selectedFile, {
            title: draftToSubmit.title,
            content: draftToSubmit.content,
          });
        }
        if (draftToSubmit.imageUrl.trim()) {
          return uploadImage(draftToSubmit.imageUrl.trim(), {
            title: draftToSubmit.title,
            content: draftToSubmit.content,
          });
        }
        throw new Error("No image selected");
      }

      const content = resolveContent(draftToSubmit);
      if (!content) {
        throw new Error("Content is required");
      }

      const body: Record<string, unknown> = {
        type: draftToSubmit.type,
        content,
        source: "web",
      };

      if (draftToSubmit.title.trim()) body.title = draftToSubmit.title;
      if (draftToSubmit.sourceUrl && draftToSubmit.type === "bookmark") {
        body.source_url = draftToSubmit.sourceUrl;
      }

      const meta: Record<string, unknown> = {};

      if (draftToSubmit.type === "bookmark" && previewMetadata) {
        if (previewMetadata.title) meta.title = previewMetadata.title;
        if (previewMetadata.description)
          meta.description = previewMetadata.description;
        if (previewMetadata.favicon) meta.favicon = previewMetadata.favicon;
        if (previewMetadata.site_name)
          meta.site_name = previewMetadata.site_name;
        if (previewMetadata.image) meta.image = previewMetadata.image;
        if (previewMetadata.url) meta.url = previewMetadata.url;
      }

      const typeMeta = draftToMetadata(draftToSubmit);
      if (typeMeta) {
        Object.assign(meta, typeMeta);
      }

      if (Object.keys(meta).length > 0) {
        body.metadata = meta;
      }

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg: string | undefined = payload?.error?.message;
        throw new Error(msg ?? "Failed to save");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });

      if (!mountedRef.current) return;

      clearDraft();
      clearSelectedFile();
      toast.success("Saved.");
      onClose();
    },
  });

  function updateField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (mutation.error) {
      mutation.reset();
    }
  }

  const handleSubmit = useCallback(() => {
    if (!canSubmitImage || mutation.isPending) return;
    mutation.mutate(draft);
  }, [draft, mutation, canSubmitImage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const contentRequired = isContentRequired(draft.type);
  const submitDisabled = mutation.isPending || !canSubmitImage;
  const error = mutation.error ? mutation.error.message : null;

  return {
    draft,
    setDraft,
    selectedFile,
    setSelectedFile,
    previewUrl,
    setPreviewUrl,
    isDragOver,
    setIsDragOver,
    previewMetadata,
    setPreviewMetadata,
    clearSelectedFile,
    handleTypeChange,
    handleFile,
    handleFileInput,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handlePaste,
    handleMetadataFetched,
    handleTitlePrefill,
    mutation,
    updateField,
    handleSubmit,
    handleKeyDown,
    canSubmitImage,
    contentRequired,
    submitDisabled,
    error,
    contentRef,
    dropZoneRef,
    clearDraft,
  };
}
