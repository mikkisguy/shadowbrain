"use client";

import { AddDialogProvider } from "./use-add-dialog";
import { AddDialog } from "./add-dialog";
import type { ReactNode } from "react";

/**
 * Single mount point for the quick-add dialog.
 *
 * Wraps children in `<AddDialogProvider>` so any component in
 * the subtree can call `useAddDialog()`, and renders
 * `<AddDialog />` as a sibling (same pattern as
 * `CommandPaletteRoot`).
 */
export function AddDialogRoot({ children }: { children: ReactNode }) {
  return (
    <AddDialogProvider>
      {children}
      <AddDialog />
    </AddDialogProvider>
  );
}

export { useAddDialog } from "./use-add-dialog";
