const WORKFLOW_STATUS_VALUES = ["todo", "in_progress", "done"] as const;

export type WorkflowStatusValue = (typeof WORKFLOW_STATUS_VALUES)[number];

export const WORKFLOW_STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
] as const satisfies ReadonlyArray<{
  value: WorkflowStatusValue;
  label: string;
}>;

/** Value → label map for Base UI Select (`items` prop). */
export const WORKFLOW_STATUS_ITEMS: Record<string, string> = Object.fromEntries(
  WORKFLOW_STATUS_OPTIONS.map((opt) => [opt.value, opt.label])
);

export function workflowStatusLabel(value: string): string {
  return WORKFLOW_STATUS_ITEMS[value] ?? value;
}

function isWorkflowStatusValue(value: unknown): value is WorkflowStatusValue {
  return (
    typeof value === "string" &&
    (WORKFLOW_STATUS_VALUES as readonly string[]).includes(value)
  );
}

export function parseWorkflowStatus(
  metadata: string | null | undefined
): WorkflowStatusValue {
  if (!metadata) return "todo";
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    if (isWorkflowStatusValue(parsed.status)) {
      return parsed.status;
    }
  } catch {
    /* fall through */
  }
  return "todo";
}
