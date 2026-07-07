"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { useCommandPalette } from "./use-command-palette";
import { cn } from "@/lib/utils";
import { PaletteBody } from "./palette-body";

/**
 * Global command palette dialog.
 *
 * Architecture:
 *
 *   - `<CommandPalette />` owns the base-ui `Dialog`. It
 *     stays mounted for the lifetime of the page so the
 *     `useCommandPalette` global shortcut can toggle it.
 *   - The actual stateful UI (the cmdk input, the
 *     debounced search) lives in `<PaletteBody />`, which
 *     is only rendered while `open === true`. This means
 *     every time the dialog opens, the body remounts and
 *     the state is fresh by construction — there is no
 *     "reset on close" effect to write, and the `eslint
 *     react-hooks/set-state-in-effect` rule has nothing
 *     to complain about.
 *
 * Two pieces of behavior the cmdk default does not cover
 * are implemented here:
 *
 *   1. **Two-stage Esc** — the first Esc blurs the cmdk input
 *      (and stops propagation so the dialog's default Esc
 *      handler does not close the palette). The second Esc,
 *      which fires when no input is focused, bubbles to the
 *      dialog and closes it. This matches the design spec's
 *      "standard pattern".
 *   2. **Debounced FTS5 fetch** — when the user has typed at
 *      least 2 characters we fetch `/api/search?q=…&limit=8`
 *      after a 300ms idle. The result renders in a "Content"
 *      group below "Pages". An empty result set renders
 *      "(no results)" inside the group rather than collapsing
 *      the group header — the spec calls this out explicitly
 *      to avoid layout jumps while typing.
 */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className="bg-scrim fixed inset-0 isolate z-50 backdrop-blur-xs supports-backdrop-filter:backdrop-blur-xs"
        />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-testid="command-palette"
          className={cn(
            // Desktop: a centered modal sized to fit all
            // three groups (Pages, Content, Utilities)
            // comfortably.
            // Mobile: full-screen. The `md:` breakpoint is
            // the same one the top nav uses.
            "bg-popover text-popover-foreground border-border fixed z-50 flex flex-col overflow-hidden border outline-none",
            "top-0 right-0 bottom-0 left-0 rounded-none",
            "md:top-[20%] md:right-auto md:bottom-auto md:left-1/2 md:max-h-[72vh] md:w-[min(40rem,calc(100%-3rem))] md:-translate-x-1/2 md:rounded-lg"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search ShadowBrain or jump to a page.
          </DialogPrimitive.Description>
          {open ? <PaletteBody /> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
