"use client";

import { useSyncExternalStore } from "react";

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCommandPalette } from "@/components/command-palette";

/**
 * Centered palette trigger.
 *
 * On desktop: rendered as a search-input-styled button with a
 * placeholder and platform-appropriate keyboard-shortcut hint
 * (⌘K on macOS, Ctrl K on Windows/Linux).
 *
 * On mobile: collapses to a magnifying-glass icon button in the
 * same position. There is no keyboard shortcut on mobile.
 *
 * The component lives inside the `CommandPaletteProvider` tree
 * (mounted in the root layout) and reads the open state via the
 * `useCommandPalette` hook. The actual dialog is rendered by a
 * sibling `<CommandPalette />` so the same provider is the single
 * source of truth for the keyboard shortcut too.
 */
export function PaletteTrigger() {
  const { setOpen } = useCommandPalette();
  const shortcut = usePlatformShortcut();

  const open = () => setOpen(true);

  return (
    <>
      {/* Desktop: search-input style trigger */}
      <button
        type="button"
        data-palette-trigger
        data-testid="palette-trigger-desktop"
        onClick={open}
        aria-label={`Open command palette — ${shortcut}`}
        className={cn(
          "border-border bg-surface-elevated hidden h-8 w-full max-w-sm items-center gap-2 rounded-sm border",
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
        <kbd
          aria-hidden="true"
          className="border-border bg-background text-muted-foreground inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] font-medium"
        >
          {shortcut}
        </kbd>
      </button>

      {/* Mobile: icon-only trigger in the same position */}
      <button
        type="button"
        data-palette-trigger
        data-testid="palette-trigger-mobile"
        onClick={open}
        aria-label="Open command palette"
        className={cn(
          "border-border bg-surface-elevated inline-flex size-11 items-center justify-center rounded-sm border",
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
 * Returns the keyboard-shortcut label appropriate for the user's
 * platform. Uses `useSyncExternalStore` so the server can render
 * the non-Mac default ("Ctrl K") and the client can swap in "⌘K"
 * for Mac users without a hydration mismatch.
 */
function usePlatformShortcut(): string {
  return useSyncExternalStore(
    // Platform doesn't change at runtime, so the subscribe function
    // is a no-op (returns an empty unsubscribe).
    () => () => {},
    getClientShortcut,
    () => "Ctrl K"
  );
}

/** Snapshot used on the client. */
function getClientShortcut(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";
}
