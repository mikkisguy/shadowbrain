"use client";

import { cn } from "@/lib/utils";
import {
  WORKFLOW_STATUS_OPTIONS,
  type WorkflowStatusValue,
} from "@/lib/workflow-status";

export interface WorkflowStatusStripProps {
  value: WorkflowStatusValue | string;
  onChange: (next: WorkflowStatusValue) => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function WorkflowStatusStrip({
  value,
  onChange,
  disabled,
  className,
  "data-testid": testId = "workflow-status-strip",
}: WorkflowStatusStripProps) {
  return (
    <div
      role="group"
      aria-label="Workflow status"
      data-testid={testId}
      className={cn("inline-flex flex-wrap items-center gap-0.5", className)}
    >
      {WORKFLOW_STATUS_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={`${testId}-${opt.value}`}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              if (disabled || isActive) return;
              onChange(opt.value);
            }}
            className={cn(
              "inline-flex min-h-7 items-center rounded-sm border px-2 py-0.5",
              "font-sans text-[0.7rem] font-medium tracking-[0.02em]",
              "focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isActive
                ? "border-foreground/40 bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:border-border hover:text-foreground border-transparent"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
