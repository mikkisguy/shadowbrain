"use client";

import { useCallback, useState } from "react";

/**
 * Per-instance delete dialog state.
 *
 * Each item detail page has its own delete dialog instance so multiple
 * tabs can each have an open dialog without cross-talk. The hook owns
 * the open/close state and provides a stable `setOpen` callback for
 * the trigger button and dialog.
 *
 * Follows the same pattern as `useEditDialog`.
 */
export function useDeleteDialog() {
  const [open, setOpen] = useState(false);

  const stableSetOpen = useCallback((next: boolean) => setOpen(next), []);

  return { open, setOpen: stableSetOpen };
}
