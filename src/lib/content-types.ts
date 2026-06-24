/**
 * Canonical content-type → design-token and label maps.
 *
 * Every surface that renders a content-item type marker (the item
 * detail page, the Browse feed card, the command palette) needs the
 * same two lookups: a colour utility derived from the `--color-type-*`
 * tokens in `globals.css`, and a human-readable label. This module is
 * the single source for both so the vocabulary lives in one place.
 *
 * Unknown types fall back to the "raw" token / raw label so a value
 * outside the vocabulary never breaks a render — it just renders in
 * the neutral grey.
 */

/** `content_items.type` → Tailwind background utility backed by the
 *  matching `--color-type-*` design token. `raw_text` and `raw` share
 *  the raw token; any unrecognised type resolves to it. */
const TYPE_COLORS: Record<string, string> = {
  note: "bg-type-note",
  journal: "bg-type-journal",
  bookmark: "bg-type-bookmark",
  question: "bg-type-question",
  project: "bg-type-project",
  person: "bg-type-person",
  event: "bg-type-event",
  dream: "bg-type-dream",
  raw: "bg-type-raw",
  raw_text: "bg-type-raw",
  image: "bg-type-image",
};

/** `content_items.type` → Title-cased display label. Unrecognised
 *  types have no entry, so `typeLabel()` falls back to the raw value. */
const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  journal: "Journal",
  bookmark: "Bookmark",
  question: "Question",
  project: "Project",
  person: "Person",
  event: "Event",
  dream: "Dream",
  raw: "Raw",
  raw_text: "Raw",
  image: "Image",
};

/** Neutral fallback for types outside the known vocabulary. */
const RAW_COLOR_CLASS = "bg-type-raw";

/** Resolve a content-item `type` to its design-system colour utility
 *  (e.g. `"bg-type-note"`). Falls back to the raw token for types
 *  outside the vocabulary so a render never breaks. */
export function typeColorClass(type: string): string {
  return TYPE_COLORS[type] ?? RAW_COLOR_CLASS;
}

/** Resolve a content-item `type` to a human-readable, title-cased
 *  label. Falls back to the raw `type` string when the type is
 *  outside the vocabulary. */
export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
