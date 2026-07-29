import { coerceViewsTab, type ViewsTab } from "./types";

const VIEWS_KEYS = ["view", "project", "item"] as const;

export interface ViewsUrlState {
  view: ViewsTab;
  projectId: string | null;
  itemId: string | null;
}

/** Shallow equality for two URL state sets. Used by writers to bail out
 *  when a patch does not actually change anything. */
export function viewsStateEqual(a: ViewsUrlState, b: ViewsUrlState): boolean {
  return (
    a.view === b.view && a.projectId === b.projectId && a.itemId === b.itemId
  );
}

/** Parse `URLSearchParams` into views URL state. */
export function readViewsFromParams(params: URLSearchParams): ViewsUrlState {
  const project = params.get("project");
  const item = params.get("item");

  return {
    view: coerceViewsTab(params.get("view")),
    projectId: project?.trim() ? project.trim() : null,
    itemId: item?.trim() ? item.trim() : null,
  };
}

/** Serialise views state back into `URLSearchParams`, preserving any
 *  unrelated params. Default `grid` is omitted from the URL. */
export function writeViewsToParams(
  base: URLSearchParams,
  state: ViewsUrlState
): URLSearchParams {
  const next = new URLSearchParams(base);

  if (state.view === "grid") {
    next.delete("view");
  } else {
    next.set("view", state.view);
  }

  if (state.projectId?.trim()) {
    next.set("project", state.projectId);
  } else {
    next.delete("project");
  }

  if (state.itemId?.trim()) {
    next.set("item", state.itemId);
  } else {
    next.delete("item");
  }

  return next;
}

export { VIEWS_KEYS };
