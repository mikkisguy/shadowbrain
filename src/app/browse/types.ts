/**
 * Browse page state types.
 *
 * The Browse page (`/`) is a single client component that holds the
 * current filter set in URL query params so a refresh, a back-button
 * press, or a shared link reproduces the same view. These types
 * describe the canonical filter shape and the response from
 * `fetchBrowseItems`.
 *
 * The API endpoints are split:
 *   - `GET /api/items` — paginated, filterable list (no FTS5)
 *   - `GET /api/search?q=…` — FTS5 search (also accepts the same
 *     `type` / `tag` filters as `/api/items`)
 *
 * When `q` is set we route to `/api/search`; otherwise we route to
 * `/api/items` with the date / source / page params that the search
 * endpoint does not accept. The result is normalized to a single
 * `BrowseResponse` shape so the feed component never has to branch.
 */

/** Subset of `content_items` columns the Browse feed renders. Both
 *  endpoints return the same shape (id, type, title, content, …),
 *  so a single type covers both. Tags are looked up separately when
 *  the card renders; the API does not include them. */
export interface BrowseItem {
  id: string;
  type: string;
  title: string | null;
  content: string;
  /** Full URL to an attached image, ready to drop into an
   *  `<img src=…>`. The DB column is a relative path
   *  (`notes/2026-01/uuid.webp`); the API client prefixes it with
   *  `/api/images/` so the card never has to know the URL shape.
   *  `null` when the item has no attached image. */
  image_url: string | null;
  source: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrowseResponse {
  items: BrowseItem[];
  total: number;
  page: number;
  limit: number;
}

/** The five tabs the issue spec calls out, plus the sentinel "All"
 *  for the un-filtered view. The Browse page is a *foundation* —
 *  the design spec lists six tabs (adding "Raw"); this issue lands
 *  the five the user sees in the spec's mockup, and the sixth can
 *  be added in a follow-up. */
export const BROWSE_TYPE_TABS = [
  "all",
  "note",
  "journal",
  "bookmark",
  "question",
] as const;
export type BrowseTypeTab = (typeof BROWSE_TYPE_TABS)[number];

/** Display modes for the feed. `grid` is the editorial multi-
 *  column card layout (default); `list` is the wide single-
 *  column row. The view is a local display preference, not a
 *  filter, and lives outside the URL filter set. */
export const BROWSE_VIEWS = ["grid", "list"] as const;
export type BrowseView = (typeof BROWSE_VIEWS)[number];

/** Coerce an arbitrary string into a valid view id. */
export function coerceBrowseView(value: string | null | undefined): BrowseView {
  if (!value) return "grid";
  return (BROWSE_VIEWS as readonly string[]).includes(value)
    ? (value as BrowseView)
    : "grid";
}

/** Map from a tab id to the value we send to the API. The "all" tab
 *  sends an empty string so the filter helper omits the `type` param. */
export const TYPE_TAB_VALUE: Record<BrowseTypeTab, string> = {
  all: "",
  note: "note",
  journal: "journal",
  bookmark: "bookmark",
  question: "question",
};

/** Display label and accent colour (the design-system type token)
 *  for each tab. "all" deliberately has no accent — the tab itself
 *  is the neutral default. */
export interface TypeTabMeta {
  label: string;
  /** Tailwind class for the coloured dot rendered next to the tab
   *  label. Empty string for "all". */
  dotClass: string;
}

export const TYPE_TAB_META: Record<BrowseTypeTab, TypeTabMeta> = {
  all: { label: "All", dotClass: "" },
  note: { label: "Notes", dotClass: "bg-type-note" },
  journal: { label: "Journal", dotClass: "bg-type-journal" },
  bookmark: { label: "Bookmarks", dotClass: "bg-type-bookmark" },
  question: { label: "Questions", dotClass: "bg-type-question" },
};

/** Filters that travel through the URL. Each field is a string so
 *  the URL helpers (`URLSearchParams.get`) can read it directly;
 *  `undefined` / empty string means "no filter set". */
export interface BrowseFilters {
  q?: string;
  type?: string;
  tag?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
}

/** The default filter set — no filters active, first page. */
export const EMPTY_BROWSE_FILTERS: BrowseFilters = {};

/** Coerce an arbitrary string (e.g. from a URL param) into a valid
 *  tab id. Returns `"all"` for unknown values so a stale or
 *  hand-crafted link never breaks the page. */
export function coerceTypeTab(value: string | null | undefined): BrowseTypeTab {
  if (!value) return "all";
  return (BROWSE_TYPE_TABS as readonly string[]).includes(value)
    ? (value as BrowseTypeTab)
    : "all";
}
