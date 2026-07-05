/**
 * Static catalogue of command-palette items.
 *
 * The palette's default view shows two groups:
 *
 *   - **Pages** — the 6 app routes. Routes that are not yet
 *     built (chat, graph, tags, settings) are listed anyway
 *     because the design spec promises the palette as the
 *     primary navigation; missing pages fall back to a
 *     "coming soon" route that still resolves to a 200. The
 *     spec explicitly calls for a placeholder on `/graph`, and
 *     the other three are at the same maturity stage.
 *   - **Utilities** — sign-out (only when authenticated).
 *
 * v1 has no "Recent" section and no action items; this file
 * will grow when those land.
 *
 * Each item is identified by a stable `id` so:
 *
 *   - the URL hash stays stable across renders (cmdk uses it
 *     as the React key + the `value` for keyboard selection),
 *   - the fuzzy filter can match against `keywords` without
 *     duplicating the label string in two places.
 */

/** Discriminated union of palette items. */
export type CommandItem = PageCommandItem | UtilityCommandItem;

export interface PageCommandItem {
  id: string;
  kind: "page";
  label: string;
  description?: string;
  href: string;
  /** Extra tokens that should match the fuzzy filter but are
   *  not part of the visible label. */
  keywords?: string[];
}

export interface UtilityCommandItem {
  id: string;
  kind: "utility";
  label: string;
  description?: string;
  /** Action identifier — the palette maps these to local
   *  handlers in `command-palette.tsx`. */
  action: "signOut" | "quickAdd";
}

const page = (item: Omit<PageCommandItem, "kind">): PageCommandItem => ({
  ...item,
  kind: "page",
});

const utility = (
  item: Omit<UtilityCommandItem, "kind">
): UtilityCommandItem => ({ ...item, kind: "utility" });

/** The 6 app routes, in display order. The list is intentionally
 *  fixed so the user can build muscle memory — see the design
 *  spec's "Default view" section. */
export const pages: PageCommandItem[] = [
  page({
    id: "page.browse",
    label: "Browse",
    description: "Browse your knowledge base",
    href: "/",
    keywords: ["home", "feed", "all"],
  }),
  page({
    id: "page.chat",
    label: "Chat",
    description: "Chat with your second brain",
    href: "/chat",
    keywords: ["assistant", "ask", "ai"],
  }),
  page({
    id: "page.graph",
    label: "Graph",
    description: "Visual knowledge graph",
    href: "/graph",
    keywords: ["graph", "visual", "network"],
  }),
  page({
    id: "page.add",
    label: "Add",
    description: "Create a new item",
    href: "/add",
    keywords: ["new", "create", "write", "capture"],
  }),
  page({
    id: "page.tags",
    label: "Tags",
    description: "Tag management",
    href: "/tags",
    keywords: ["tag", "labels", "categorize"],
  }),
  page({
    id: "page.settings",
    label: "Settings",
    description: "Configuration",
    href: "/settings",
    keywords: ["config", "preferences"],
  }),
];

/** Utility items shown in the palette. The sign-out entry is
 *  conditionally rendered by the palette itself (it is only
 *  meaningful when the visitor is authenticated), so this
 *  list is the *unconditional* catalogue; consumers filter as
 *  needed. */
export const utilities: UtilityCommandItem[] = [
  utility({
    id: "utility.quickAdd",
    label: "Quick Add",
    description: "Add a new item",
    action: "quickAdd",
  }),
  utility({
    id: "utility.signOut",
    label: "Sign out",
    description: "End your session",
    action: "signOut",
  }),
];

/** Convenience: every item in display order. Used by tests
 *  and by the palette's "all items" view (future work). */
export const allItems: CommandItem[] = [...pages, ...utilities];

/** Convert a CommandItem to the haystack string the fuzzy
 *  filter scores against. Page items also match their
 *  `keywords`; utility items use the label only. */
export function searchHaystack(item: CommandItem): string {
  if (item.kind === "page") {
    return [item.label, ...(item.keywords ?? [])].join(" ");
  }
  return item.label;
}
