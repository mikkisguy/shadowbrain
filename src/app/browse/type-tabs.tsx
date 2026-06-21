"use client";

/**
 * Type-tab strip.
 *
 * Five tabs (All, Notes, Journal, Bookmarks, Questions), each with
 * a small coloured dot keyed to the design system's `type-*` tokens
 * so the user can pre-attentively parse a long list by colour. The
 * "all" tab has no dot — it is the neutral default and gets the
 * full focus ring on selection.
 *
 * The strip is keyboard-navigable: each tab is a real `<button>`
 * with `aria-pressed` so a screen reader announces the active tab
 * and the user can Tab between them. The component is intentionally
 * a controlled component — the parent owns the active tab id and
 * handles the URL sync.
 *
 * Accessibility: the strip is a *toggle button group*, not a true
 * ARIA `tablist`. The WAI-ARIA tab pattern requires a matching
 * `tabpanel` for each tab; here the "panel" is the entire feed
 * below, which has its own semantics and would force an artificial
 * tabpanels structure on the rest of the page. Toggle buttons are
 * the recommended pattern for a one-of-N selector without a
 * tabpanel — see https://www.w3.org/WAI/ARIA/apg/patterns/button/.
 */

import { cn } from "@/lib/utils";
import {
  type BrowseTypeTab,
  BROWSE_TYPE_TABS,
  TYPE_TAB_META,
  TYPE_TAB_VALUE,
} from "./types";

export interface TypeTabsProps {
  active: BrowseTypeTab;
  onChange: (next: BrowseTypeTab) => void;
  /** Disable interaction (e.g. while the initial request is in
   *  flight). The tabs still render so the user sees the active
   *  state. */
  disabled?: boolean;
}

export function TypeTabs({ active, onChange, disabled }: TypeTabsProps) {
  return (
    <div
      role="group"
      aria-label="Filter by content type"
      className="border-border flex flex-wrap items-center gap-1 border-b"
      data-testid="type-tabs"
    >
      {BROWSE_TYPE_TABS.map((tab) => {
        const meta = TYPE_TAB_META[tab];
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={isActive}
            data-testid={`type-tab-${tab}`}
            disabled={disabled}
            onClick={() => {
              if (disabled || tab === active) return;
              onChange(tab);
            }}
            className={cn(
              // Layout: pill-button with hairline border. The
              // 2px radius is the design-system default; Tailwind's
              // `rounded-sm` collapses to it.
              "inline-flex items-center gap-2 rounded-sm border px-3 py-1.5",
              "font-sans text-xs font-medium tracking-[0.04em] uppercase",
              "focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isActive
                ? "border-foreground/40 bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:border-border hover:text-foreground border-transparent"
            )}
          >
            {meta.dotClass ? (
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", meta.dotClass)}
              />
            ) : null}
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Helper: map a `BrowseTypeTab` to the value the API receives.
 *  Lives in this module so the tab strip and the page that
 *  consumes the change agree on the encoding. */
export function apiValueForTab(tab: BrowseTypeTab): string {
  return TYPE_TAB_VALUE[tab];
}
