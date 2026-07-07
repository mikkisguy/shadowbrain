"use client";

/**
 * Item edit dialog.
 *
 * A modal dialog — modelled on `AddDialog` — for editing an existing
 * content item's title, content, type, tags, source, URL, visibility,
 * and type-specific metadata. It opens from the item detail page and
 * calls `PATCH /api/items/[id]` on save.
 *
 * Features:
 *  - All fields pre-filled from the current item
 *  - Markdown textarea ⇄ preview toggle
 *  - Tag multi-select with autocomplete (create new or pick existing)
 *  - Unsaved-changes warning via `beforeunload`
 *  - Ctrl+Enter shortcut
 *  - Sonner toasts for success / error feedback
 */

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  XIcon,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
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
import type { ContentItem, Tag } from "@/db/index";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
import { TYPE_ITEMS, hasTypeSpecificFields } from "@/lib/add-form/types";
import { TypeSpecificFields } from "@/components/add-form/type-specific-fields";
import { type EditDraft, draftFromItem } from "./draft-helpers";
import { TagAutocomplete } from "./tag-autocomplete";
import { useEditForm } from "./use-edit-form";

// ---------------------------------------------------------------------------
// Edit dialog — public API
// ---------------------------------------------------------------------------

export interface EditDialogProps {
  item: ContentItem;
  tags: Tag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save so the page can refresh its data. */
  onSaved?: () => void;
}

export function EditDialog({
  item,
  tags: initialTags,
  open,
  onOpenChange,
  onSaved,
}: EditDialogProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      setShowUnsavedWarning(true);
    } else {
      onOpenChange(false);
    }
  }, [hasChanges, onOpenChange]);

  const handleConfirmClose = useCallback(() => {
    setShowUnsavedWarning(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleClose();
          } else {
            onOpenChange(true);
          }
        }}
      >
        <DialogPortal>
          <DialogOverlay className="z-[60]" />
          <DialogPrimitive.Popup
            className={cn(
              "bg-popover text-popover-foreground border-border fixed z-[60] flex flex-col overflow-hidden border p-4 outline-none",
              // Mobile (< 768px): full screen
              "top-0 right-0 bottom-0 left-0 rounded-none",
              // Desktop (≥ 768px): centered modal — size varies by expanded state
              isExpanded
                ? "md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:max-h-[90vh] md:w-[min(56rem,calc(100%-3rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
                : "md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:max-h-[70vh] md:w-[min(36rem,calc(100%-3rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
            )}
          >
            <EditForm
              item={item}
              initialTags={initialTags}
              onClose={handleClose}
              onForceClose={() => onOpenChange(false)}
              onSaved={onSaved}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded((v) => !v)}
              hasChanges={hasChanges}
              onHasChangesChange={setHasChanges}
            />
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  className="absolute top-3 right-3"
                  size="icon-sm"
                />
              }
              onClick={handleClose}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>

      {/* Unsaved changes warning dialog */}
      <Dialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <DialogPortal>
          <DialogOverlay className="z-[70]" />
          <DialogPrimitive.Popup
            className={cn(
              "bg-popover text-popover-foreground border-border fixed top-1/2 left-1/2 z-[70] w-[min(24rem,calc(100%-3rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-lg outline-none"
            )}
          >
            <DialogHeader className="mb-4">
              <DialogTitle className="text-lg">Discard changes?</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground mb-6 text-sm">
              You have unsaved changes. Are you sure you want to close? Your
              changes will be lost.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowUnsavedWarning(false)}
              >
                Keep editing
              </Button>
              <Button variant="destructive" onClick={handleConfirmClose}>
                Discard
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit form body
// ---------------------------------------------------------------------------

function EditForm({
  item,
  initialTags,
  onClose,
  onForceClose,
  onSaved,
  isExpanded,
  onToggleExpand,
  hasChanges,
  onHasChangesChange,
}: {
  item: ContentItem;
  initialTags: Tag[];
  onClose: () => void;
  onForceClose: () => void;
  onSaved?: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  hasChanges: boolean;
  onHasChangesChange: (hasChanges: boolean) => void;
}) {
  const [draft, setDraft] = useState<EditDraft>(() =>
    draftFromItem(item, initialTags)
  );
  const [showPreview, setShowPreview] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Track initial draft for change detection.
  const initialDraftRef = useRef<EditDraft>(draftFromItem(item, initialTags));

  // Re-initialise when item changes (e.g. navigating between items).
  useEffect(() => {
    const fresh = draftFromItem(item, initialTags);
    initialDraftRef.current = fresh;
    startTransition(() => {
      setDraft(fresh);
      onHasChangesChange(false);
      setShowPreview(false);
    });
  }, [item.id, item.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autofocus the content textarea on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      contentRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Unsaved-changes warning.
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // Mutation + field updater
  const { mutation, updateField } = useEditForm({
    item,
    initialDraftRef,
    setDraft,
    onHasChangesChange,
    onSaved,
    onForceClose,
  });

  const handleSubmit = useCallback(() => {
    if (mutation.isPending) return;
    mutation.mutate(draft);
  }, [draft, mutation]);

  // Ctrl+Enter handler.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const submitDisabled = mutation.isPending || !hasChanges;
  const error = mutation.error ? mutation.error.message : null;

  return (
    <>
      <DialogHeader className="mb-3 flex-row items-center justify-between gap-3 pr-10">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </DialogTitle>
        <div className="flex items-center gap-2">
          <Select
            value={draft.type}
            onValueChange={(v) => {
              if (v) updateField("type", v as string);
            }}
            items={TYPE_ITEMS}
          >
            <SelectTrigger className="border-border/60 text-muted-foreground hover:border-border hover:text-foreground h-7 w-auto gap-1.5 rounded-full border-dashed px-3 text-xs font-medium transition-colors">
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

      <div className="mb-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {/* Content editing area */}
        <div className="bg-muted/30 ring-border/40 focus-within:bg-muted/40 focus-within:ring-border/60 flex min-h-0 flex-1 flex-col gap-2 rounded-xl p-4 ring-1 transition-colors">
          <Input
            className="border-border/80 placeholder:text-muted-foreground/50 focus-visible:border-border/50 h-auto border-0 border-b bg-transparent px-0 pb-2 font-serif text-xl font-medium focus-visible:ring-0 md:text-xl"
            placeholder="Title (optional)"
            value={draft.title}
            onChange={(e) => updateField("title", e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {/* Preview toggle */}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setShowPreview((v) => !v)}
              className="text-muted-foreground gap-1"
            >
              {showPreview ? (
                <>
                  <EyeOff className="size-3" aria-hidden />
                  Edit
                </>
              ) : (
                <>
                  <Eye className="size-3" aria-hidden />
                  Preview
                </>
              )}
            </Button>
          </div>

          {showPreview ? (
            <div className="text-foreground min-h-[200px] flex-1 overflow-y-auto px-0 text-base leading-relaxed">
              {draft.content.trim() ? (
                <MarkdownContent content={draft.content} />
              ) : (
                <p className="text-muted-foreground italic">
                  Nothing to preview.
                </p>
              )}
            </div>
          ) : (
            <Textarea
              ref={contentRef}
              className="placeholder:text-muted-foreground/50 min-h-[200px] flex-1 resize-none border-0 bg-transparent px-0 text-base leading-relaxed focus-visible:ring-0"
              placeholder="Content\u2026"
              value={draft.content}
              onChange={(e) => updateField("content", e.target.value)}
              onKeyDown={handleKeyDown}
              rows={8}
            />
          )}
        </div>

        {/* Tags */}
        <TagAutocomplete tags={draft.tags} updateField={updateField} />

        {/* URL and Source */}
        <div className="grid grid-cols-2 gap-2">
          <Input
            className="col-span-2 h-7 text-xs"
            placeholder="URL"
            value={draft.sourceUrl}
            onChange={(e) => updateField("sourceUrl", e.target.value)}
            onKeyDown={handleKeyDown}
            type="url"
          />
          <Input
            className="col-span-2 h-7 text-xs"
            placeholder="Source"
            value={draft.source}
            onChange={(e) => updateField("source", e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Visibility */}
        <div className="flex flex-wrap gap-4">
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_hidden === 1}
              onChange={(e) =>
                updateField("is_hidden", e.target.checked ? 1 : 0)
              }
              className="accent-primary size-3.5"
            />
            Hidden
          </label>
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_private === 1}
              onChange={(e) =>
                updateField("is_private", e.target.checked ? 1 : 0)
              }
              className="accent-primary size-3.5"
            />
            Private
          </label>
        </div>

        {hasTypeSpecificFields(draft.type) && (
          <TypeSpecificFields
            draft={draft}
            updateField={updateField}
            handleKeyDown={handleKeyDown}
          />
        )}

        {/* Read-only dates */}
        <div className="text-muted-foreground flex gap-4 font-mono text-xs">
          <span>Created: {item.created_at}</span>
          <span>Updated: {item.updated_at}</span>
        </div>

        {error && (
          <p role="alert" className="text-destructive font-sans text-sm">
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
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button
          variant="inverted"
          onClick={handleSubmit}
          disabled={submitDisabled}
        >
          {mutation.isPending && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
