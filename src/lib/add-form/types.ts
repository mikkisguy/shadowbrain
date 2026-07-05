/**
 * Shared type vocabulary and helpers for the add and edit forms.
 *
 * Extracted from `add-dialog.tsx` and `edit-dialog.tsx` so both surfaces
 * speak the same language.
 */

// ---------------------------------------------------------------------------
// Draft shape — one flat record so a single ref can carry the entire form
// state across close/reopen cycles. Field names mirror the backend metadata
// keys from src/app/api/items/route.ts so the submit handler can map them
// 1:1 without translation.
// ---------------------------------------------------------------------------

export interface Draft {
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

export function emptyDraft(): Draft {
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

export const TYPE_ITEMS: Record<string, string> = {
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
export const CONTENT_PLACEHOLDER: Record<string, string> = {
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

export function titlePlaceholder(type: string): string {
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

export function isContentRequired(type: string): boolean {
  return CONTENT_REQUIRED[type] ?? true;
}

/** Resolve the effective content value at submit time. For types where
 *  content is optional, fall back to the URL (bookmark) or the title
 *  (person/project/event) so the API's `min(1)` validation passes. */
export function resolveContent(draft: Draft): string {
  const content = draft.content.trim();
  if (content) return content;
  if (draft.type === "bookmark") return draft.sourceUrl.trim();
  if (draft.title.trim()) return draft.title.trim();
  return "";
}

/** Whether the form has enough data to submit. */
export function canSubmit(draft: Draft): boolean {
  if (resolveContent(draft)) return true;
  return false;
}

/** Whether the current type has any type-specific metadata fields. */
export function hasTypeSpecificFields(type: string): boolean {
  return ["bookmark", "person", "project", "event", "dream"].includes(type);
}
