"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Per-instance edit dialog state.
 *
 * Each item detail page has its own edit dialog instance so multiple
 * tabs can each have an open dialog without cross-talk. The hook owns
 * the open/close state and provides a stable `toggle` callback for
 * contextual triggers (e.g. an "Edit" button in the header).
 *
 * Unlike the global add-dialog (which uses a single context provider),
 * this hook is used directly by the component that renders each edit
 * dialog — no context needed.
 */

export function useEditDialog() {
  const [open, setOpen] = useState(false);

  const stableSetOpen = useCallback((next: boolean) => setOpen(next), []);

  const value = useMemo(
    () => ({ open, setOpen: stableSetOpen }),
    [open, stableSetOpen]
  );

  return value;
}
