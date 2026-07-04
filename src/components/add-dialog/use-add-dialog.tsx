"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Public API of the quick-add dialog.
 *
 * The state is owned by a single `AddDialogProvider`
 * mounted once by the root layout; the `useAddDialog` hook
 * reads the current `open` flag and gives any component in
 * the tree a way to open or close the dialog.
 *
 * Modeled after the `CommandPaletteProvider` pattern from
 * `use-command-palette.tsx` so the two surfaces feel
 * consistent.
 */

interface AddDialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const AddDialogContext = createContext<AddDialogContextValue | null>(null);

/**
 * Access the add-dialog controller.
 *
 * Must be called inside an `<AddDialogProvider>` — the root
 * layout guarantees this because `<AddDialogRoot />` wraps
 * the entire authenticated tree. Calling outside throws a
 * dev-time error.
 */
export function useAddDialog(): AddDialogContextValue {
  const value = useContext(AddDialogContext);
  if (!value) {
    throw new Error("useAddDialog must be used inside an <AddDialogProvider>");
  }
  return value;
}

interface AddDialogProviderProps {
  children: ReactNode;
}

/**
 * Single-owner context for the add dialog. Wraps the
 * authenticated tree in the root layout, with a sibling
 * `<AddDialog />` that reads the same `open` boolean.
 */
export function AddDialogProvider({ children }: AddDialogProviderProps) {
  const [open, setOpen] = useState(false);

  // Stable reference so consumers (the command palette's
  // `activate` callback, the header's add button) don't
  // re-render just because `setOpen` was recreated.
  const stableSetOpen = useCallback((next: boolean) => setOpen(next), []);

  const value = useMemo<AddDialogContextValue>(
    () => ({ open, setOpen: stableSetOpen }),
    [open, stableSetOpen]
  );

  return (
    <AddDialogContext.Provider value={value}>
      {children}
    </AddDialogContext.Provider>
  );
}
