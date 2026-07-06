"use client";

/**
 * Add page form — split-pane markdown editor/preview for content types,
 * single-column form for structured types, with bookmark preview and
 * draft persistence via localStorage.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Image, Loader2, Trash2, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
import type { BookmarkMetadata } from "@/lib/metadata-fetcher";
import {
  type Draft,
  emptyDraft,
  TYPE_ITEMS,
  CONTENT_PLACEHOLDER,
  titlePlaceholder,
  isContentRequired,
  resolveContent,
  canSubmit,
  hasTypeSpecificFields,
} from "@/lib/add-form/types";
import { draftToMetadata } from "@/lib/add-form/metadata-helpers";
import { useDraftPersistence } from "@/lib/add-form/use-draft-persistence";
import { uploadImage } from "@/lib/add-form/upload-image";
import { TypeSpecificFields } from "@/components/add-form/type-specific-fields";
import { BookmarkPreview } from "./bookmark-preview";
import { DraftIndicator } from "./draft-indicator";

// Types that get the split-pane markdown editor + preview
const MARKDOWN_TYPES = new Set([
  "raw_text",
  "note",
  "journal",
  "question",
  "dream",
]);

interface AddPageFormProps {
  prefillType?: string;
  prefillText?: string;
  prefillUrl?: string;
}

export function AddPageForm({
  prefillType,
  prefillText,
  prefillUrl,
}: AddPageFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMetadata, setPreviewMetadata] =
    useState<BookmarkMetadata | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const prefillAppliedRef = useRef(false);

  // Draft persistence
  const { hasDraft, clearDraft } = useDraftPersistence(draft, setDraft);

  // Apply URL prefill params on first mount (only if no restored draft)
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;

    setDraft((prev) => {
      // If a draft was restored from localStorage, don't overwrite with params
      if (prev.content.trim() || prev.title.trim() || prev.sourceUrl.trim()) {
        return prev;
      }

      const next = { ...prev };
      let changed = false;

      if (prefillType && prefillType in TYPE_ITEMS) {
        next.type = prefillType;
        changed = true;
      }
      if (prefillText) {
        next.content = prefillText;
        changed = true;
      }
      if (prefillUrl) {
        next.sourceUrl = prefillUrl;
        if (
          prefillType === "bookmark" ||
          (!prefillType && next.type === "raw_text")
        ) {
          next.type = "bookmark";
        }
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [prefillType, prefillText, prefillUrl]);

  // Auto-focus content textarea
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      contentRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Mutation
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
      if (!content) throw new Error("Content is required");

      const body: Record<string, unknown> = {
        type: draftToSubmit.type,
        content,
        source: "web",
      };

      if (draftToSubmit.title.trim()) body.title = draftToSubmit.title;
      if (draftToSubmit.sourceUrl && draftToSubmit.type === "bookmark") {
        body.source_url = draftToSubmit.sourceUrl;
      }

      // Build metadata
      const meta: Record<string, unknown> = {};

      // For bookmarks, include preview metadata if available
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

      // Type-specific metadata from shared helper
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });
      clearDraft();
      toast.success("Saved.");
      // Redirect to the new item's detail page
      const itemId = data?.id;
      if (itemId) {
        router.push(`/item/${itemId}`);
      } else {
        router.push("/");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to save");
    },
  });

  const updateField = useCallback(
    <K extends keyof Draft>(field: K, value: Draft[K]) => {
      setDraft((prev) => ({ ...prev, [field]: value }));
      if (mutation.error) mutation.reset();
    },
    [mutation]
  );

  const canSubmitImage =
    draft.type === "image"
      ? selectedFile !== null || draft.imageUrl.trim().length > 0
      : canSubmit(draft);

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

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);

  // ---- Image file handlers ----

  const clearSelectedFile = useCallback(() => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

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

  // ---- Cleanup object URLs on unmount ----
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isMarkdownType = MARKDOWN_TYPES.has(draft.type);
  const contentRequired = isContentRequired(draft.type);
  const submitDisabled = mutation.isPending || !canSubmitImage;
  const error = mutation.error ? mutation.error.message : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row: type selector + actions */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">
          Add
        </h1>
        <div className="flex items-center gap-2">
          <Select
            value={draft.type}
            onValueChange={(v) => {
              if (v) {
                updateField("type", v);
                if (v !== "bookmark") {
                  setPreviewMetadata(null);
                }
                if (v !== "image") {
                  clearSelectedFile();
                }
              }
            }}
            items={TYPE_ITEMS}
          >
            <SelectTrigger
              aria-label="Content type"
              className="border-border/60 text-muted-foreground hover:border-border hover:text-foreground h-8 w-auto gap-1.5 rounded-full border-dashed px-3 text-xs font-medium transition-colors"
            >
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main form area */}
      {draft.type === "image" ? (
        // Image upload: drop zone in card
        <div className="flex flex-col gap-3" onPaste={handlePaste}>
          <div className="bg-muted/30 ring-border/40 focus-within:bg-muted/40 focus-within:ring-border/60 flex flex-col gap-2 rounded-xl p-4 ring-1 transition-colors">
            <Input
              className="border-border/80 placeholder:text-muted-foreground/50 focus-visible:border-border/50 h-auto border-0 border-b bg-transparent px-0 pb-2 font-serif text-xl font-medium focus-visible:ring-0 md:text-xl"
              placeholder={titlePlaceholder(draft.type)}
              value={draft.title}
              onChange={(e) => updateField("title", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div
              ref={dropZoneRef}
              data-testid="add-dialog-drop-zone"
              className={cn(
                "flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors",
                isDragOver
                  ? "border-border bg-muted/40"
                  : "border-border/50 hover:border-border hover:bg-muted/20",
                previewUrl ? "min-h-[200px] pb-4" : "min-h-[300px]"
              )}
              onClick={() => {
                const input = dropZoneRef.current?.querySelector(
                  "input[type=file]"
                ) as HTMLInputElement | null;
                input?.click();
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Image preview"
                  className="max-h-[300px] rounded-md object-contain"
                />
              ) : (
                <>
                  <Image className="text-muted-foreground/50 size-10" />
                  <p className="text-muted-foreground text-sm">
                    Drop an image here, paste from clipboard, or click to browse
                  </p>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInput}
                data-testid="add-dialog-file-input"
              />
            </div>
            {previewUrl && (
              <div className="flex items-center gap-2">
                <p className="text-muted-foreground truncate text-xs">
                  {selectedFile?.name ?? "Image selected"}
                </p>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSelectedFile();
                  }}
                  aria-label="Remove image"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            )}
          </div>
          {hasTypeSpecificFields(draft.type) && (
            <TypeSpecificFields
              draft={draft}
              updateField={updateField}
              handleKeyDown={handleKeyDown}
              imageUrlProps={{ disabled: selectedFile !== null }}
            />
          )}
        </div>
      ) : isMarkdownType ? (
        // Split pane: editor left, preview right (desktop)
        // Toggle on mobile — the toggle sits above both panes so it
        // is always reachable regardless of which pane is visible.
        <div className="flex flex-col gap-4">
          {/* Mobile edit/preview toggle — always visible on small screens */}
          <div className="flex justify-end md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
              aria-label={showPreview ? "Show editor" : "Show preview"}
              className="text-muted-foreground gap-1.5"
            >
              {showPreview ? (
                <>
                  <EyeOff className="size-3.5" aria-hidden />
                  Edit
                </>
              ) : (
                <>
                  <Eye className="size-3.5" aria-hidden />
                  Preview
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Editor pane */}
            <div
              className={cn(
                "flex flex-col gap-3",
                showPreview && "hidden md:flex"
              )}
            >
              <div className="bg-muted/30 ring-border/40 focus-within:bg-muted/40 focus-within:ring-border/60 flex min-h-[400px] flex-col gap-2 rounded-xl p-4 ring-1 transition-colors md:min-h-[600px]">
                <Input
                  className="border-border/80 placeholder:text-muted-foreground/50 focus-visible:border-border/50 h-auto border-0 border-b bg-transparent px-0 pb-2 font-serif text-xl font-medium focus-visible:ring-0 md:text-xl"
                  placeholder={titlePlaceholder(draft.type)}
                  value={draft.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Textarea
                  ref={contentRef}
                  className="placeholder:text-muted-foreground/50 min-h-[300px] flex-1 resize-none border-0 bg-transparent px-0 text-base leading-relaxed focus-visible:ring-0 md:min-h-[500px]"
                  placeholder={
                    CONTENT_PLACEHOLDER[draft.type] ?? "Type here\u2026"
                  }
                  value={draft.content}
                  onChange={(e) => updateField("content", e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={15}
                  aria-required={contentRequired}
                />
              </div>

              {/* Type-specific fields */}
              {hasTypeSpecificFields(draft.type) && (
                <TypeSpecificFields
                  draft={draft}
                  updateField={updateField}
                  handleKeyDown={handleKeyDown}
                />
              )}
            </div>

            {/* Preview pane */}
            <div
              className={cn(
                "flex flex-col gap-3",
                !showPreview && "hidden md:flex"
              )}
            >
              <div className="bg-muted/20 border-border/40 min-h-[400px] rounded-xl border p-4 md:min-h-[600px]">
                <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wider uppercase">
                  Preview
                </p>
                {draft.content.trim() ? (
                  <MarkdownContent content={draft.content} />
                ) : (
                  <p className="text-muted-foreground italic">
                    Nothing to preview.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Non-markdown types: single column form
        <div className="flex flex-col gap-3">
          <div className="bg-muted/30 ring-border/40 focus-within:bg-muted/40 focus-within:ring-border/60 flex flex-col gap-2 rounded-xl p-4 ring-1 transition-colors">
            <Input
              className="border-border/80 placeholder:text-muted-foreground/50 focus-visible:border-border/50 h-auto border-0 border-b bg-transparent px-0 pb-2 font-serif text-xl font-medium focus-visible:ring-0 md:text-xl"
              placeholder={titlePlaceholder(draft.type)}
              value={draft.title}
              onChange={(e) => updateField("title", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Textarea
              ref={contentRef}
              className="placeholder:text-muted-foreground/50 min-h-[120px] flex-1 resize-none border-0 bg-transparent px-0 text-base leading-relaxed focus-visible:ring-0"
              placeholder={CONTENT_PLACEHOLDER[draft.type] ?? "Type here\u2026"}
              value={draft.content}
              onChange={(e) => updateField("content", e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              aria-required={contentRequired}
            />
          </div>

          {/* Type-specific fields */}
          {hasTypeSpecificFields(draft.type) && (
            <>
              <TypeSpecificFields
                draft={draft}
                updateField={updateField}
                handleKeyDown={handleKeyDown}
                bookmarkUrlProps={draft.type === "bookmark" ? {} : undefined}
              />
              {/* Bookmark preview */}
              {draft.type === "bookmark" && (
                <BookmarkPreview
                  url={draft.sourceUrl}
                  onMetadataFetched={handleMetadataFetched}
                  onTitlePrefill={handleTitlePrefill}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p role="alert" className="text-error font-sans text-sm">
          {error}
        </p>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <span className="text-muted-foreground mr-auto hidden text-xs md:inline">
          Ctrl+Enter to save
        </span>
        {hasDraft && (
          <Button variant="ghost" size="sm" onClick={handleDiscardDraft}>
            <Trash2 className="mr-1.5 size-3.5" aria-hidden />
            Discard draft
          </Button>
        )}
        <Button
          variant="inverted"
          onClick={handleSubmit}
          disabled={submitDisabled}
          data-testid="add-page-submit"
        >
          {mutation.isPending && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}
          {draft.type === "image" ? "Upload" : "Save"}
        </Button>
      </div>
    </div>
  );
}
