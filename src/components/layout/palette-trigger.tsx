"use client";

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Centered palette trigger.
 *
 * On desktop: rendered as a search-input-styled button with a
 * placeholder and keyboard-shortcut hint.
 *
 * On mobile: collapses to a magnifying-glass icon button in the same
 * position.
 *
 * The command palette itself is implemented in #88 — this trigger
 * is intentionally a stub for now. It carries `data-palette-trigger`
 * so the palette component can attach a click handler later (either
 * by replacing the handler directly, or by event delegation on the
 * data attribute), and stays a focusable button for keyboard
 * navigation regardless.
 */
export function PaletteTrigger() {
  return (
    <>
      {/* Desktop: search-input style trigger */}
      <button
        type="button"
        data-palette-trigger
        data-testid="palette-trigger-desktop"
        onClick={openPalette}
        aria-label="Open command palette (coming soon)"
        className={cn(
          "border-border bg-surface-elevated hidden h-8 w-full max-w-sm items-center gap-2 border",
          "text-muted-foreground px-3 text-left text-sm outline-none",
          "hover:border-border-strong hover:bg-surface-muted transition-colors",
          "focus-visible:border-primary focus-visible:ring-primary focus-visible:ring-1",
          "md:flex"
        )}
      >
        <Search
          aria-hidden="true"
          className="size-4 shrink-0"
          strokeWidth={1.5}
        />
        <span className="flex-1 truncate">Search or jump to…</span>
        <kbd className="border-border bg-background text-muted-foreground inline-flex h-5 items-center border px-1.5 font-mono text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      {/* Mobile: icon-only trigger in the same position */}
      <button
        type="button"
        data-palette-trigger
        data-testid="palette-trigger-mobile"
        onClick={openPalette}
        aria-label="Open command palette (coming soon)"
        className={cn(
          "border-border bg-surface-elevated inline-flex size-8 items-center justify-center border",
          "text-muted-foreground transition-colors outline-none",
          "hover:border-border-strong hover:bg-surface-muted hover:text-foreground",
          "focus-visible:border-primary focus-visible:ring-primary focus-visible:ring-1",
          "md:hidden"
        )}
      >
        <Search aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </>
  );
}

/**
 * Stub: the actual command palette is implemented in #88. Until
 * that lands the trigger is intentionally a no-op so we ship the
 * layout shell without a half-built palette. We log to the browser
 * console in dev to make the stub discoverable; in production the
 * log is suppressed to avoid leaving a dead message in the console.
 */
function openPalette(): void {
  if (process.env.NODE_ENV === "development") {
    console.info(
      "[ShadowBrain] Command palette is not yet implemented. See #88."
    );
  }
}
