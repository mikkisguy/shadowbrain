/**
 * Unified draft persistence hook.
 *
 * Auto-saves a Draft to localStorage (debounced) and restores it on
 * mount. Both the quick-add dialog and the /add page share the same
 * localStorage key so a draft started in one surface is available in
 * the other.
 *
 * API: `useDraftPersistence(draft, setDraft)` returns
 * `{ hasDraft, clearDraft }`.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

import type { Draft } from "./types";
import { emptyDraft } from "./types";

const STORAGE_KEY = "shadowbrain:add-draft";
const DEBOUNCE_MS = 300;

/** Read the persisted draft from localStorage. Returns null when no
 *  draft exists or the stored data is corrupt. */
function readStoredDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

/** Write the draft to localStorage. Silently ignores write failures
 *  (e.g. quota exceeded, private-mode Safari). */
function writeStoredDraft(draft: Draft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore — storage full or unavailable.
  }
}

/** Remove the stored draft. */
export function clearStoredDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

/** Whether the draft has any user-entered data. */
function isNonEmptyDraft(d: Draft): boolean {
  return !!(
    d.content.trim() ||
    d.title.trim() ||
    d.sourceUrl.trim() ||
    d.email.trim() ||
    d.phoneNumber.trim() ||
    d.role.trim() ||
    d.status.trim() ||
    d.repo.trim() ||
    d.started ||
    d.goalEndDate ||
    d.startDate ||
    d.endDate ||
    d.duration.trim() ||
    d.mood.trim()
  );
}

/**
 * Auto-save `draft` to localStorage (debounced) and expose helpers
 * for reading / clearing the persisted state.
 *
 * - On mount, restores any previously saved draft via the caller's
 *   `setDraft` initializer (lazy, no extra render).
 * - Saves fire `DEBOUNCE_MS` after the last change.
 * - Empty drafts are cleared from storage rather than persisted.
 * - `hasDraft` is derived from the current draft state — it is true
 *   whenever the draft has user-entered content.
 * - Call `clearDraft()` after a successful submit so neither surface
 *   shows a stale indicator.
 */
export function useDraftPersistence(
  draft: Draft,
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
): { hasDraft: boolean; clearDraft: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore on mount — lazy initializer reads localStorage before the
  // first render so there is no flash of empty → restored content.
  // The setDraft callback is stable (from useState), so this effect
  // runs exactly once.
  useEffect(() => {
    setDraft((prev) => {
      const stored = readStoredDraft();
      if (stored && isNonEmptyDraft(stored)) return stored;
      return prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save on every draft change.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (!isNonEmptyDraft(draft)) {
      clearStoredDraft();
      return;
    }

    timerRef.current = setTimeout(() => {
      writeStoredDraft(draft);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [draft]);

  // Derived: true whenever the draft has user-entered content.
  const hasDraft = useMemo(() => isNonEmptyDraft(draft), [draft]);

  const clearDraft = useCallback(() => {
    clearStoredDraft();
    setDraft(emptyDraft());
  }, [setDraft]);

  return { hasDraft, clearDraft };
}
