"use client";

/**
 * Views-page URL state hook.
 *
 * Owns URL ⇄ state sync for `view`, `project`, and `item` query params.
 * `useSearchParams` + `useRouter` from `next/navigation` are the only I/O.
 *
 * Implementation note: `searchParams` is mirrored into local `useState` so
 * that an in-test `router.replace` (which does not trigger a real React
 * re-render) propagates through the hook. In production, Next.js invalidates
 * the page on `replace` and `useSearchParams` returns the new value on the
 * next render; the local state mirrors the same value.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ViewsTab } from "./types";
import {
  readViewsFromParams,
  viewsStateEqual,
  writeViewsToParams,
  type ViewsUrlState,
} from "./views-url-sync";

export interface UseViewsStateResult {
  view: ViewsTab;
  projectId: string | null;
  itemId: string | null;
  setView: (view: ViewsTab) => void;
  setProjectId: (projectId: string | null) => void;
  setItemId: (itemId: string) => void;
  clearItem: () => void;
}

export function useViewsState(): UseViewsStateResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<ViewsUrlState>(() =>
    readViewsFromParams(searchParams)
  );
  const lastSyncedRef = useRef(searchParams.toString());

  useEffect(() => {
    const next = searchParams.toString();
    if (next === lastSyncedRef.current) return;
    lastSyncedRef.current = next;
    setState(readViewsFromParams(searchParams));
  }, [searchParams]);

  const writeState = useCallback(
    (next: ViewsUrlState) => {
      const params = writeViewsToParams(searchParams, next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  const patchState = useCallback(
    (patch: Partial<ViewsUrlState>) => {
      const next: ViewsUrlState = { ...state, ...patch };
      if (viewsStateEqual(next, state)) return;
      setState(next);
      writeState(next);
    },
    [state, writeState]
  );

  const setView = useCallback(
    (view: ViewsTab) => {
      patchState({ view });
    },
    [patchState]
  );

  const setProjectId = useCallback(
    (projectId: string | null) => {
      patchState({ projectId });
    },
    [patchState]
  );

  const setItemId = useCallback(
    (itemId: string) => {
      patchState({ itemId });
    },
    [patchState]
  );

  const clearItem = useCallback(() => {
    patchState({ itemId: null });
  }, [patchState]);

  return {
    view: state.view,
    projectId: state.projectId,
    itemId: state.itemId,
    setView,
    setProjectId,
    setItemId,
    clearItem,
  };
}
