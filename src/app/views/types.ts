/**
 * Views page shared types.
 *
 * `ViewsShell` owns page chrome and URL state; `ViewsGrid` consumes
 * `GridRow` for the event/task spreadsheet.
 */

export type ViewsTab = "grid" | "timeline" | "kanban";

export const VIEWS_TABS = ["grid", "timeline", "kanban"] as const;

/** Coerce an arbitrary string (e.g. from a URL param) into a valid tab.
 *  Returns `"grid"` for unknown values so a stale link never breaks the page. */
export function coerceViewsTab(value: string | null | undefined): ViewsTab {
  if (value === "timeline" || value === "kanban" || value === "grid") {
    return value;
  }
  return "grid";
}

export type GridRow = {
  id: string;
  type: "event" | "task" | string;
  title: string | null;
  status: string | null; // todo | in_progress | done
  startOrDue: string | null; // event start_date OR task due_date (prefer due for task)
  end: string | null;
  parent: { id: string; title: string | null; type: string } | null;
  tags: string[];
  updatedAt: string;
  /** raw metadata object for merge-on-PATCH */
  metadata: Record<string, unknown>;
};
