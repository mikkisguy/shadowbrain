"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Loader2, Maximize2, Minimize2, Plus, XIcon } from "lucide-react";
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
import { useAddDialog } from "./use-add-dialog";

// ---------------------------------------------------------------------------
// Draft shape — one flat record so a single ref can carry the entire form
// state across close/reopen cycles. Field names mirror the backend metadata
// keys from src/app/api/items/route.ts so the submit handler can map them
// 1:1 without translation.
// ---------------------------------------------------------------------------

interface Draft {
  type: string;
  content: string;
  title: string;
  // bookmark — top-level `source_url` on the API
  sourceUrl: string;
  // person — metadata.{email, phone_number, role}
  email: string;
  phoneNumber: string;
  role: string;
  // project — metadata.{status, repo, started, goal_end_date}
  status: string;
  repo: string;
  started: string;
  goalEndDate: string;
  // event — metadata.{start_date, end_date, duration}
  startDate: string;
  endDate: string;
  duration: string;
  // dream — metadata.mood
  mood: string;
}

function emptyDraft(): Draft {
  return {
    type: "raw_text",
    content: "",
    title: "",
    sourceUrl: "",
    email: "",
    phoneNumber: "",
    role: "",
    status: "",
    repo: "",
    started: "",
    goalEndDate: "",
    startDate: "",
    endDate: "",
    duration: "",
    mood: "",
  };
}

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
// Per-type UI configuration: placeholders, field visibility, and the
// content-fallback used when the user leaves the content textarea empty
// for types where content is secondary (bookmark, person, project, event).
// ---------------------------------------------------------------------------

/** Content textarea placeholder per type. */
const CONTENT_PLACEHOLDER: Record<string, string> = {
  raw_text: "Type or paste anything\u2026",
  note: "Write a quick note\u2026",
  journal: "What happened today?",
  bookmark: "Notes about this bookmark (optional)\u2026",
  question: "What\u2019s your question?",
  person: "Notes about this person (optional)\u2026",
  project: "Notes about this project (optional)\u2026",
  event: "Describe this event (optional)\u2026",
  dream: "Describe your dream\u2026",
};

/** Title input placeholder per type. Falls back to "Title (optional)". */
const TITLE_PLACEHOLDER: Record<string, string> = {
  person: "Name",
  project: "Project name",
  event: "Event name",
  bookmark: "Bookmark title (optional)",
};

function titlePlaceholder(type: string): string {
  return TITLE_PLACEHOLDER[type] ?? "Title (optional)";
}

/** Whether the content textarea is required for this type. When false,
 *  the submit handler auto-fills content from the URL (bookmark) or the
 *  title (person/project/event) so the API's `content: min(1)` validation
 *  still passes. */
const CONTENT_REQUIRED: Record<string, boolean> = {
  raw_text: true,
  note: true,
  journal: true,
  bookmark: false,
  question: true,
  person: false,
  project: false,
  event: false,
  dream: true,
};

function isContentRequired(type: string): boolean {
  return CONTENT_REQUIRED[type] ?? true;
}

/** Resolve the effective content value at submit time. For types where
 *  content is optional, fall back to the URL (bookmark) or the title
 *  (person/project/event) so the API's `min(1)` validation passes. */
function resolveContent(draft: Draft): string {
  const content = draft.content.trim();
  if (content) return content;
  if (draft.type === "bookmark") return draft.sourceUrl.trim();
  if (draft.title.trim()) return draft.title.trim();
  return "";
}

/** Whether the form has enough data to submit. */
function canSubmit(draft: Draft): boolean {
  if (resolveContent(draft)) return true;
  return false;
}

/** Whether the current type has any type-specific metadata fields. */
function hasTypeSpecificFields(type: string): boolean {
  return ["bookmark", "person", "project", "event", "dream"].includes(type);
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function AddDialog() {
  const { open, setOpen } = useAddDialog();
  const draftRef = useRef<Draft>(emptyDraft());
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          className={cn(
            "bg-popover text-popover-foreground border-border fixed z-50 flex flex-col overflow-hidden border p-4 outline-none",
            // Mobile (< 768px): full screen
            "top-0 right-0 bottom-0 left-0 rounded-none",
            // Desktop (≥ 768px): centered modal — overrides the
            // mobile fullscreen positioning above.
            isExpanded
              ? "md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:max-h-[90vh] md:w-[min(56rem,calc(100%-3rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
              : "md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:max-h-[70vh] md:w-[min(36rem,calc(100%-3rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
          )}
        >
          <AddForm
            draftRef={draftRef}
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
// Form body. Renders only while the dialog is open; state is initialised
// from the draftRef on mount and synced back on every change so a close
// without saving preserves the draft.
// ---------------------------------------------------------------------------

function AddForm({
  draftRef,
  onClose,
  isExpanded,
  onToggleExpand,
}: {
  draftRef: React.MutableRefObject<Draft>;
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  // Ref guard for mount status: if the component unmounts before
  // the response lands (dialog was closed and reopened with fresh
  // content), do not overwrite the new draft or close the dialog again.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Re-initialise from the persisted draft every time the form mounts
  // (dialog opens), so a prior close-then-reopen picks up any unsaved
  // content. The initial render starts with an empty draft; this effect
  // overwrites it before the user sees any output because the dialog's
  // open animation runs in the same tick.
  useEffect(() => {
    setDraft(draftRef.current);
  }, [draftRef]);

  // Autofocus the content textarea on mount. A requestAnimationFrame
  // gives the dialog's open animation a frame to settle so the
  // focus-visible ring renders at the right position.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      contentRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Mutation for creating a new item
  const mutation = useMutation({
    mutationFn: async (draftToSubmit: Draft) => {
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

      // Build metadata for type-specific fields. Only keys that
      // are present in the API's per-type metadata schemas are
      // included; the superRefine in route.ts will validate them.
      const meta: Record<string, unknown> = {};
      if (draftToSubmit.type === "person") {
        if (draftToSubmit.email.trim()) meta.email = draftToSubmit.email;
        if (draftToSubmit.phoneNumber.trim())
          meta.phone_number = draftToSubmit.phoneNumber;
        if (draftToSubmit.role.trim()) meta.role = draftToSubmit.role;
      }
      if (draftToSubmit.type === "project") {
        if (draftToSubmit.status.trim()) meta.status = draftToSubmit.status;
        if (draftToSubmit.repo.trim()) meta.repo = draftToSubmit.repo;
        if (draftToSubmit.started) meta.started = draftToSubmit.started;
        if (draftToSubmit.goalEndDate)
          meta.goal_end_date = draftToSubmit.goalEndDate;
      }
      if (draftToSubmit.type === "event") {
        if (draftToSubmit.startDate) meta.start_date = draftToSubmit.startDate;
        if (draftToSubmit.endDate) meta.end_date = draftToSubmit.endDate;
        if (draftToSubmit.duration.trim())
          meta.duration = draftToSubmit.duration;
      }
      if (draftToSubmit.type === "dream") {
        if (draftToSubmit.mood.trim()) meta.mood = draftToSubmit.mood;
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
      // Invalidate the browse query so the feed refetches and
      // shows the newly-created item. Using `queryKeys.browse.all`
      // invalidates all browse queries regardless of filters.
      queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });

      // Gate on mount status: if the component unmounted before
      // the response landed (dialog was closed and reopened with
      // fresh content), do not overwrite the new draft or close
      // the dialog again.
      if (!mountedRef.current) return;

      const fresh = emptyDraft();
      draftRef.current = fresh;
      setDraft(fresh);
      toast.success("Saved.");
      onClose();
    },
  });

  function updateField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      draftRef.current = next;
      return next;
    });
    // Clear error when user starts typing
    if (mutation.error) {
      mutation.reset();
    }
  }

  const handleSubmit = useCallback(() => {
    if (!canSubmit(draft) || mutation.isPending) return;
    mutation.mutate(draft);
  }, [draft, mutation]);

  // Ctrl+Enter / Cmd+Enter handler.
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
  const submitDisabled = mutation.isPending || !canSubmit(draft);
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
            onValueChange={(v) => {
              if (v) updateField("type", v);
            }}
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

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* Hero writing surface — the content textarea is the visual and
          functional centre of the dialog. */}
        <div className="bg-muted/30 ring-border/40 focus-within:bg-muted/40 focus-within:ring-border/60 flex min-h-0 flex-1 flex-col gap-2 rounded-xl p-4 ring-1 transition-colors">
          <Input
            data-testid="add-dialog-title"
            className="border-border/80 placeholder:text-muted-foreground/50 focus-visible:border-border/50 h-auto border-0 border-b bg-transparent px-0 pb-2 font-serif text-xl font-medium focus-visible:ring-0 md:text-xl"
            placeholder={titlePlaceholder(draft.type)}
            value={draft.title}
            onChange={(e) => updateField("title", e.target.value)}
            onKeyDown={handleKeyDown}
          />

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
        </div>

        {/* Type-specific metadata — compact, secondary, below the hero
          writing surface so it never competes for attention. */}
        {hasTypeSpecificFields(draft.type) && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Details
            </p>
            <div className="grid grid-cols-2 gap-2">
              {draft.type === "bookmark" && (
                <Input
                  data-testid="add-dialog-bookmark-url"
                  className="col-span-2 h-7 text-xs"
                  placeholder="URL"
                  value={draft.sourceUrl}
                  onChange={(e) => updateField("sourceUrl", e.target.value)}
                  onKeyDown={handleKeyDown}
                  type="url"
                />
              )}

              {draft.type === "person" && (
                <>
                  <Input
                    data-testid="add-dialog-person-email"
                    className="col-span-2 h-7 text-xs"
                    placeholder="Email"
                    value={draft.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="email"
                  />
                  <Input
                    data-testid="add-dialog-person-phone"
                    className="h-7 text-xs"
                    placeholder="Phone"
                    value={draft.phoneNumber}
                    onChange={(e) => updateField("phoneNumber", e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="tel"
                  />
                  <Input
                    data-testid="add-dialog-person-role"
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
                    data-testid="add-dialog-project-status"
                    className="h-7 text-xs"
                    placeholder="Status"
                    value={draft.status}
                    onChange={(e) => updateField("status", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    data-testid="add-dialog-project-repo"
                    className="h-7 text-xs"
                    placeholder="Repository"
                    value={draft.repo}
                    onChange={(e) => updateField("repo", e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="url"
                  />
                  <Input
                    data-testid="add-dialog-project-started"
                    className="h-7 text-xs"
                    type="datetime-local"
                    value={draft.started}
                    onChange={(e) => updateField("started", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    data-testid="add-dialog-project-goal-end"
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
                    data-testid="add-dialog-event-start"
                    className="h-7 text-xs"
                    type="datetime-local"
                    value={draft.startDate}
                    onChange={(e) => updateField("startDate", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    data-testid="add-dialog-event-end"
                    className="h-7 text-xs"
                    type="datetime-local"
                    value={draft.endDate}
                    onChange={(e) => updateField("endDate", e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Input
                    data-testid="add-dialog-event-duration"
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
                  data-testid="add-dialog-dream-mood"
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
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// The "+" button that sits in the top nav. Exported so the header can
// render it directly and re-use the same hook.
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
