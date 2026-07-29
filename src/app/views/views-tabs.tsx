"use client";

import { cn } from "@/lib/utils";
import { coerceViewsTab, VIEWS_TABS, type ViewsTab } from "./types";

const TAB_LABELS: Record<ViewsTab, string> = {
  grid: "Grid",
  timeline: "Timeline",
  kanban: "Kanban",
};

export interface ViewsTabsProps {
  active: ViewsTab;
  onChange: (next: ViewsTab) => void;
  disabled?: boolean;
}

export function ViewsTabs({ active, onChange, disabled }: ViewsTabsProps) {
  const safeActive = coerceViewsTab(active);

  return (
    <div
      role="group"
      aria-label="Views"
      className="border-border flex flex-wrap items-center gap-1 border-b"
      data-testid="views-tabs"
    >
      {VIEWS_TABS.map((tab) => {
        const isActive = tab === safeActive;
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={isActive}
            data-testid={`views-tab-${tab}`}
            disabled={disabled}
            onClick={() => {
              if (disabled || isActive) return;
              onChange(tab);
            }}
            className={cn(
              "inline-flex min-h-11 items-center rounded-sm border px-3 py-1.5",
              "font-sans text-xs font-medium tracking-[0.04em] uppercase",
              "focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isActive
                ? "border-foreground/40 bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:border-border hover:text-foreground border-transparent"
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}
