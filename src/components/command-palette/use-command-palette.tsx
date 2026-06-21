"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Public API of the global command palette.
 *
 * The state is owned by a single `CommandPaletteProvider`
 * mounted in the root layout (see `src/app/layout.tsx`); both
 * the top-nav trigger and the modal dialog consume it from
 * context. The hook also installs a global `keydown` listener
 * for `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux) so the
 * palette opens regardless of focus.
 *
 * The shortcut is intentionally not guarded by "is an input
 * focused". The design spec calls this the "standard pattern"
 * (Linear, GitHub, Raycast): the user is allowed to be typing
 * in a page input and still pop the palette on top of it. The
 * two-stage Esc behavior — first blurs the palette's own
 * input, second closes the dialog — keeps the inner input
 * usable without sacrificing the close affordance.
 */
export interface CommandPaletteContextValue {
  /** Whether the palette is currently open. */
  open: boolean;
  /** Imperative setter. `false` triggers the close animation. */
  setOpen: (next: boolean) => void;
  /** Flip the current open state. Wired to Cmd+K / Ctrl+K. */
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null
);

/** Consume the palette state. Throws if the component is not
 *  inside a `CommandPaletteProvider` — this is a hard
 *  programming error, not a recoverable runtime condition. */
export function useCommandPalette(): CommandPaletteContextValue {
  const value = useContext(CommandPaletteContext);
  if (!value) {
    throw new Error(
      "useCommandPalette must be used inside a <CommandPaletteProvider>"
    );
  }
  return value;
}

interface CommandPaletteProviderProps {
  children: ReactNode;
}

/**
 * Mounts the palette state. Installs the global keyboard
 * shortcut listener. The actual `<Dialog>` lives in
 * `<CommandPalette />`, a sibling rendered by the layout.
 */
export function CommandPaletteProvider({
  children,
}: CommandPaletteProviderProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  // Global keyboard shortcut: Cmd+K (macOS) / Ctrl+K (others).
  // - preventDefault() stops the browser from focusing the URL
  //   bar (the platform default for both ⌘K and Ctrl+K in most
  //   browsers).
  // - stopPropagation() keeps a focused page input from also
  //   receiving the keystroke, so typing `k` in a textarea does
  //   not insert a "k" *and* open the palette.
  // - We attach to `document` (not `window`) so the listener
  //   is removed automatically when the document is replaced
  //   (e.g. during a soft navigation that swaps the root
  //   document).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      // Ignore the extra modifier keys (Alt / Shift) — ⌘K is
      // unambiguous and we don't want ⌘⇧K to do anything.
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle }),
    [open, toggle]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}
