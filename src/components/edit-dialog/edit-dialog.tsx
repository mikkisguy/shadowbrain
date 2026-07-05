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
  useMemo,
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
import { toast } from "sonner";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
import type { ContentItem, Tag } from "@/db/index";
import { MarkdownContent } from "@/app/item/[id]/markdown-content";
// ---------------------------------------------------------------------------
// Type vocabulary (matches src/lib/content-types.ts labels)
// ---------------------------------------------------------------------------

const TYPE_ITEMS: Record<string, string> = {
  raw_text: "Raw",
  note: "Note",
  journal: "Journal",
  bookmark: "Bookmark",
  question: "Question",
  person: "Person",
  project: "Project",
  event: "Event",
  dream: "Dream",
};

// ---------------------------------------------------------------------------
// Draft shape — mirrors AddDialog's Draft but starts from the item's data.
// ---------------------------------------------------------------------------

interface EditDraft {
  type: string;
  title: string;
  content: string;
  sourceUrl: string;
  source: string;
  is_private: number;
  is_hidden: number;
  tags: string[];
  // person
  email: string;
  phoneNumber: string;
  role: string;
  // project
  status: string;
  repo: string;
  started: string;
  goalEndDate: string;
  // event
  startDate: string;
  endDate: string;
  duration: string;
  // dream
  mood: string;
}

/** Parse metadata JSON into a flat record keyed by the draft field names. */
function metadataToDraftFields(
  type: string,
  metadata: string | null
): Partial<EditDraft> {
  if (!metadata) return {};
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return {};
  }

  const fields: Partial<EditDraft> = {};
  if (type === "person") {
    if (typeof parsed.email === "string") fields.email = parsed.email;
    if (typeof parsed.phone_number === "string")
      fields.phoneNumber = parsed.phone_number;
    if (typeof parsed.role === "string") fields.role = parsed.role;
  }
  if (type === "project") {
    if (typeof parsed.status === "string") fields.status = parsed.status;
    if (typeof parsed.repo === "string") fields.repo = parsed.repo;
    if (typeof parsed.started === "string") fields.started = parsed.started;
    if (typeof parsed.goal_end_date === "string")
      fields.goalEndDate = parsed.goal_end_date;
  }
  if (type === "event") {
    if (typeof parsed.start_date === "string")
      fields.startDate = parsed.start_date;
    if (typeof parsed.end_date === "string") fields.endDate = parsed.end_date;
    if (
      typeof parsed.duration === "string" ||
      typeof parsed.duration === "number"
    )
      fields.duration = String(parsed.duration);
  }
  if (type === "dream") {
    if (typeof parsed.mood === "string") fields.mood = parsed.mood;
  }
  return fields;
}

/** Convert draft type-specific fields back to a metadata object for the API. */
function draftToMetadata(draft: EditDraft): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  if (draft.type === "person") {
    if (draft.email.trim()) meta.email = draft.email;
    if (draft.phoneNumber.trim()) meta.phone_number = draft.phoneNumber;
    if (draft.role.trim()) meta.role = draft.role;
  }
  if (draft.type === "project") {
    if (draft.status.trim()) meta.status = draft.status;
    if (draft.repo.trim()) meta.repo = draft.repo;
    if (draft.started) meta.started = draft.started;
    if (draft.goalEndDate) meta.goal_end_date = draft.goalEndDate;
  }
  if (draft.type === "event") {
    if (draft.startDate) meta.start_date = draft.startDate;
    if (draft.endDate) meta.end_date = draft.endDate;
    if (draft.duration.trim()) meta.duration = draft.duration;
  }
  if (draft.type === "dream") {
    if (draft.mood.trim()) meta.mood = draft.mood;
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

/** Build an initial draft from an item's data. */
function draftFromItem(item: ContentItem, tags: Tag[]): EditDraft {
  const meta = metadataToDraftFields(item.type, item.metadata);
  return {
    type: item.type,
    title: item.title ?? "",
    content: item.content,
    sourceUrl: item.source_url ?? "",
    source: item.source,
    is_private: item.is_private,
    is_hidden: item.is_hidden,
    tags: tags.map((t) => t.name),
    email: meta.email ?? "",
    phoneNumber: meta.phoneNumber ?? "",
    role: meta.role ?? "",
    status: meta.status ?? "",
    repo: meta.repo ?? "",
    started: meta.started ?? "",
    goalEndDate: meta.goalEndDate ?? "",
    startDate: meta.startDate ?? "",
    endDate: meta.endDate ?? "",
    duration: meta.duration ?? "",
    mood: meta.mood ?? "",
  };
}

/** Deep compare two drafts for unsaved-changes detection. */
function draftsEqual(a: EditDraft, b: EditDraft): boolean {
  return (
    a.type === b.type &&
    a.title === b.title &&
    a.content === b.content &&
    a.sourceUrl === b.sourceUrl &&
    a.source === b.source &&
    a.is_private === b.is_private &&
    a.is_hidden === b.is_hidden &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i]) &&
    a.email === b.email &&
    a.phoneNumber === b.phoneNumber &&
    a.role === b.role &&
    a.status === b.status &&
    a.repo === b.repo &&
    a.started === b.started &&
    a.goalEndDate === b.goalEndDate &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.duration === b.duration &&
    a.mood === b.mood
  );
}

/** Whether the current type has type-specific metadata fields. */
function hasTypeSpecificFields(type: string): boolean {
  return ["bookmark", "person", "project", "event", "dream"].includes(type);
}

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
          <DialogOverlay />
          <DialogPrimitive.Popup
            className={cn(
              "bg-popover text-popover-foreground border-border fixed z-50 flex flex-col overflow-hidden border p-4 outline-none",
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
          <DialogOverlay />
          <DialogPrimitive.Popup
            className={cn(
              "bg-popover text-popover-foreground border-border fixed top-1/2 left-1/2 z-[60] w-[min(24rem,calc(100%-3rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-lg outline-none"
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
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);

  // Tag autocomplete state
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Track initial draft for change detection.
  const initialDraftRef = useRef<EditDraft>(draftFromItem(item, initialTags));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  // Fetch existing tags when the dialog opens.
  useEffect(() => {
    fetch("/api/tags")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tags) {
          setAllTags(data.tags.map((t: { name: string }) => t.name));
        }
      })
      .catch(() => {
        // Silently fail — the tag input still works without suggestions.
      });
  }, []);

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

  // Mutation
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
    [mutation, onHasChangesChange]
  );

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

  // Tag handling
  const filteredSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    const lower = tagInput.toLowerCase();
    return allTags.filter(
      (name) => name.toLowerCase().includes(lower) && !draft.tags.includes(name)
    );
  }, [tagInput, allTags, draft.tags]);

  const addTag = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || draft.tags.includes(trimmed)) return;
      updateField("tags", [...draft.tags, trimmed]);
      setTagInput("");
      setShowSuggestions(false);
      tagInputRef.current?.focus();
    },
    [draft.tags, updateField]
  );

  const removeTag = useCallback(
    (name: string) => {
      updateField(
        "tags",
        draft.tags.filter((t) => t !== name)
      );
    },
    [draft.tags, updateField]
  );

  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const value = tagInput.trim();
        if (value) {
          addTag(value);
        }
      }
      if (e.key === "Backspace" && !tagInput && draft.tags.length > 0) {
        removeTag(draft.tags[draft.tags.length - 1]);
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // Let the suggestions list handle navigation — we keep it simple
        // and just prevent the cursor from moving in the input.
        e.preventDefault();
      }
    },
    [tagInput, addTag, removeTag, draft.tags]
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
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Tags
          </p>
          <div className="border-border/60 focus-within:border-ring/60 flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors">
            {draft.tags.map((tag) => (
              <span
                key={tag}
                className="bg-muted text-foreground flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-xs"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-muted-foreground hover:text-foreground inline-flex"
                  aria-label={`Remove tag ${tag}`}
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
            <div className="relative min-w-[120px] flex-1">
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  // Delay hiding so click on suggestion registers.
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
                onKeyDown={handleTagKeyDown}
                placeholder={draft.tags.length === 0 ? "Add tags\u2026" : ""}
                className="placeholder:text-muted-foreground/50 h-6 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="bg-popover border-border absolute left-0 z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border p-1 shadow-md">
                  {filteredSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(name);
                      }}
                      className="text-foreground hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {showSuggestions &&
                tagInput.trim() &&
                filteredSuggestions.length === 0 &&
                !draft.tags.includes(tagInput.trim()) && (
                  <div className="bg-popover border-border absolute left-0 z-50 mt-1 w-full rounded-lg border p-1 shadow-md">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(tagInput.trim());
                      }}
                      className="text-foreground hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm"
                    >
                      Create &ldquo;{tagInput.trim()}&rdquo;
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>

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

        {/* Type-specific metadata */}
        {hasTypeSpecificFields(draft.type) && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Details
            </p>
            <div className="grid grid-cols-2 gap-2">
              {draft.type === "person" && (
                <>
                  <Input
                    className="col-span-2 h-7 text-xs"
                    placeholder="Email"
                    value={draft.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="email"
                  />
                  <Input
                    className="h-7 text-xs"
                    placeholder="Phone"
                    value={draft.phoneNumber}
                    onChange={(e) => updateField("phoneNumber", e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="tel"
                  />
                  <Input
                    className="h-7 text-xs"
                    placeholder="Role"
                    value={draft.role}
                    onChange={(e) => updateField("role", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </>
              )}

              {draft.type === "project" && (
                <>
                  <Input
                    className="h-7 text-xs"
                    placeholder="Status"
                    value={draft.status}
                    onChange={(e) => updateField("status", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    className="h-7 text-xs"
                    placeholder="Repository"
                    value={draft.repo}
                    onChange={(e) => updateField("repo", e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="url"
                  />
                  <Input
                    className="h-7 text-xs"
                    type="datetime-local"
                    value={draft.started}
                    onChange={(e) => updateField("started", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    className="h-7 text-xs"
                    type="datetime-local"
                    value={draft.goalEndDate}
                    onChange={(e) => updateField("goalEndDate", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </>
              )}

              {draft.type === "event" && (
                <>
                  <Input
                    className="h-7 text-xs"
                    type="datetime-local"
                    value={draft.startDate}
                    onChange={(e) => updateField("startDate", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    className="h-7 text-xs"
                    type="datetime-local"
                    value={draft.endDate}
                    onChange={(e) => updateField("endDate", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    className="col-span-2 h-7 text-xs"
                    placeholder="Duration (e.g. 2h, 90m)"
                    value={draft.duration}
                    onChange={(e) => updateField("duration", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </>
              )}

              {draft.type === "dream" && (
                <Input
                  className="col-span-2 h-7 text-xs"
                  placeholder="Mood"
                  value={draft.mood}
                  onChange={(e) => updateField("mood", e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              )}
            </div>
          </div>
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
