"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  Image,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BookmarkMetadata } from "@/lib/metadata-fetcher";
import { BookmarkPreview } from "@/app/add/bookmark-preview";
import { useDraftPersistence } from "@/lib/add-form/use-draft-persistence";
import { draftToMetadata } from "@/lib/add-form/metadata-helpers";
import { uploadImage } from "@/lib/add-form/upload-image";
import { useAddDialog } from "./use-add-dialog";
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
import { TypeSpecificFields } from "@/components/add-form/type-specific-fields";

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function AddDialog() {
  const { open, setOpen } = useAddDialog();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          className={cn(
            "bg-popover text-popover-foreground border-border fixed z-50 flex flex-col overflow-hidden border p-4 outline-none",
            "top-0 right-0 bottom-0 left-0 rounded-none",
            isExpanded
              ? "md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:max-h-[90vh] md:w-[min(56rem,calc(100%-3rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
              : "md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:max-h-[70vh] md:w-[min(36rem,calc(100%-3rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
          )}
        >
          <AddForm
            onClose={() => setOpen(false)}
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded((v) => !v)}
          />
          <DialogClose
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Form body
// ---------------------------------------------------------------------------

function AddForm({
  onClose,
  isExpanded,
  onToggleExpand,
}: {
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const router = useRouter();
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

  const handleContinueInPage = useCallback(() => {
    onClose();
    router.push("/add");
  }, [onClose, router]);

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

  return (
    <>
      <DialogHeader className="mb-3 flex-row items-center justify-between gap-3 pr-10">
        <DialogTitle className="text-l font-sans font-semibold tracking-normal">
          Add
        </DialogTitle>
        <div className="flex items-center gap-2">
          <Select
            value={draft.type}
            onValueChange={handleTypeChange}
            items={TYPE_ITEMS}
          >
            <SelectTrigger
              data-testid="add-dialog-type"
              className="border-border/60 text-muted-foreground hover:border-border hover:text-foreground h-7 w-auto gap-1.5 rounded-full border-dashed px-3 text-xs font-medium transition-colors"
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
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Shrink dialog" : "Expand dialog"}
            title={isExpanded ? "Shrink" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
        </div>
      </DialogHeader>

      <div
        className="mb-4 flex min-h-0 flex-1 flex-col gap-3"
        onPaste={draft.type === "image" ? handlePaste : undefined}
      >
        <div className="bg-muted/30 ring-border/40 focus-within:bg-muted/40 focus-within:ring-border/60 flex min-h-0 flex-1 flex-col gap-2 rounded-xl p-4 ring-1 transition-colors">
          <Input
            data-testid="add-dialog-title"
            className="border-border/80 placeholder:text-muted-foreground/50 focus-visible:border-border/50 h-auto border-0 border-b bg-transparent px-0 pb-2 font-serif text-xl font-medium focus-visible:ring-0 md:text-xl"
            placeholder={titlePlaceholder(draft.type)}
            value={draft.title}
            onChange={(e) => updateField("title", e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {draft.type === "image" ? (
            <>
              <div
                ref={dropZoneRef}
                data-testid="add-dialog-drop-zone"
                className={cn(
                  "flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors",
                  isDragOver
                    ? "border-border bg-muted/40"
                    : "border-border/50 hover:border-border hover:bg-muted/20",
                  previewUrl ? "pb-4" : "py-10"
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
                    className="max-h-[200px] rounded-md object-contain"
                  />
                ) : (
                  <>
                    <Image className="text-muted-foreground/50 size-10" />
                    <p className="text-muted-foreground text-sm">
                      Drop an image here, paste from clipboard, or click to
                      browse
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
            </>
          ) : (
            <Textarea
              ref={contentRef}
              data-testid="add-dialog-content"
              className="placeholder:text-muted-foreground/50 min-h-[240px] flex-1 resize-none border-0 bg-transparent px-0 text-base leading-relaxed focus-visible:ring-0"
              placeholder={CONTENT_PLACEHOLDER[draft.type] ?? "Type here\u2026"}
              value={draft.content}
              onChange={(e) => updateField("content", e.target.value)}
              onKeyDown={handleKeyDown}
              rows={5}
              aria-required={contentRequired}
            />
          )}
        </div>

        {hasTypeSpecificFields(draft.type) && (
          <>
            <TypeSpecificFields
              draft={draft}
              updateField={updateField}
              handleKeyDown={handleKeyDown}
              bookmarkUrlProps={{
                onChange: (e) => {
                  updateField("sourceUrl", e.target.value);
                  setPreviewMetadata(null);
                },
              }}
              imageUrlProps={{
                disabled: selectedFile !== null,
              }}
            />
            {draft.type === "bookmark" && (
              <BookmarkPreview
                url={draft.sourceUrl}
                onMetadataFetched={handleMetadataFetched}
                onTitlePrefill={handleTitlePrefill}
              />
            )}
          </>
        )}

        {error && (
          <p
            id="add-dialog-error"
            role="alert"
            data-testid="add-dialog-error"
            className="text-error font-sans text-sm"
          >
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="flex-row justify-end gap-2 py-3">
        <span className="text-muted-foreground mr-auto hidden text-xs md:inline">
          Ctrl+Enter to save
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleContinueInPage}
          disabled={mutation.isPending}
        >
          Continue in page
        </Button>
        <DialogClose
          render={<Button type="button" variant="outline" />}
          disabled={mutation.isPending}
        >
          Cancel
        </DialogClose>
        <Button
          variant="inverted"
          onClick={handleSubmit}
          disabled={submitDisabled}
          data-testid="add-dialog-submit"
        >
          {mutation.isPending && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}
          {draft.type === "image" ? "Upload" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Add button
// ---------------------------------------------------------------------------

export function AddButton() {
  const { setOpen } = useAddDialog();

  return (
    <Button
      variant="inverted"
      size="default"
      mono
      onClick={() => setOpen(true)}
      data-testid="add-dialog-trigger"
      className="shrink-0 rounded-sm max-md:size-11 max-md:px-0"
    >
      <Plus className="size-4" aria-hidden />
      <span className="hidden md:inline">Add</span>
    </Button>
  );
}
