"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { BrowseItem, BrowseView } from "./types";

/** Extra pixels rendered above and below the viewport so the
 *  browser has time to paint before items scroll into view.
 *  Shared by both the grid and list Virtuoso instances. */
export const VIEWPORT_OVERSCAN_PX = 1200;

/** Breakpoints for column count — mirrors the tailwind `md:` and
 *  `lg:` thresholds the rest of the design system uses. Mobile stays
 *  a single column up to 768px (md) per the responsive spec. */
function columnCountForWidth(width: number): number {
  if (width < 768) return 1;
  if (width < 1024) return 2;
  return 3;
}

export interface UseVirtualFeedOptions {
  items: BrowseItem[] | null;
  view: BrowseView;
  infiniteScroll: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export interface UseVirtualFeedReturn {
  setGridEl: (el: HTMLDivElement | null) => void;
  gridColumnCount: number;
  gridRows: BrowseItem[][] | null;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  handleEndReached: () => void;
  VIEWPORT_OVERSCAN_PX: number;
}

export function useVirtualFeed(
  options: UseVirtualFeedOptions
): UseVirtualFeedReturn {
  const { items, view, infiniteScroll, hasMore, isLoadingMore, onLoadMore } =
    options;

  // ---- Column-count derivation for the grid -----------
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridColumnCount, setGridColumnCount] = useState(() =>
    typeof window === "undefined" ? 3 : columnCountForWidth(window.innerWidth)
  );
  useEffect(() => {
    if (!gridEl) return;
    const update = () =>
      setGridColumnCount(columnCountForWidth(gridEl.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(gridEl);
    return () => observer.disconnect();
  }, [gridEl]);

  /** Items chunked into rows of N for the single-Virtuoso grid view.
   *  Null when the grid view is not active (avoids unnecessary array work). */
  const gridRows = useMemo(() => {
    if (!items || view !== "grid" || items.length === 0) return null;
    const rows: BrowseItem[][] = [];
    for (let i = 0; i < items.length; i += gridColumnCount) {
      rows.push(items.slice(i, i + gridColumnCount));
    }
    return rows;
  }, [items, view, gridColumnCount]);

  // ---- Infinite-scroll sentinel -------------------------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!infiniteScroll) return;
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLoadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, infiniteScroll]);

  const handleEndReached = () => {
    if (!isLoadingMore && hasMore && infiniteScroll) {
      onLoadMore();
    }
  };

  return {
    setGridEl,
    gridColumnCount,
    gridRows,
    sentinelRef,
    handleEndReached,
    VIEWPORT_OVERSCAN_PX,
  };
}
