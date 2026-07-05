"use client";

/**
 * Two-column shell for the item detail page (issue #26).
 *
 * Owns the links/backlinks sidebar's open/closed state, the toggle
 * button, session persistence, and the responsive layout. The page
 * content and the sidebar are passed in as server-rendered nodes
 * (`children` and `sidebar`) so the markdown body and the link rows
 * stay server components — only the toggle behaviour is client-side.
 *
 * Behaviour:
 *   - **Toggle** ([▦]) branches on the live viewport:
 *       • Desktop (≥ 1024 px): toggles an inline `<aside>` beside the
 *         content. Button label flips "Show links" / "Hide links".
 *       • Mobile / tablet: opens an overlay **sheet** (Base UI Dialog)
 *         containing the sidebar content. Dismissible via scrim click,
 *         Escape, or the close button.
 *   - **Persistence**: the desktop inline state is written to
 *     `sessionStorage` so a reload lands on the same view.
 *   - **Responsive default**: with no stored choice the sidebar opens
 *     on desktop (≥ lg) and stays closed on mobile. The first render
 *     is always closed so server and client markup agree (no hydration
 *     mismatch); a mount effect then applies the stored / responsive
 *     default.
 */

import { useEffect, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const SIDEBAR_OPEN_KEY = "item.sidebarOpen";
const DESKTOP_QUERY = "(min-width: 1024px)";

export interface DetailLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  /** Optional extra buttons rendered next to the back button in the
   *  header toolbar. Used by the edit button on the item detail page. */
  headerActions?: React.ReactNode;
}

export function DetailLayout({
  children,
  sidebar,
  headerActions,
}: DetailLayoutProps) {
  // First render is closed on both server and client so the hydrated
  // markup matches. The mount effects below resolve the real defaults.
  const [inlineOpen, setInlineOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Track the viewport and resolve the desktop sidebar default after
  // mount. Both reads happen in one effect so the first client render
  // matches the server's `false` and there is no hydration mismatch.
  // The matchMedia listener persists across the component's lifetime
  // so a live resize keeps `isDesktop` in sync.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);

    // Resolve the desktop inline sidebar's default. A stored choice
    // wins; otherwise open on desktop and stay closed on mobile.
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(SIDEBAR_OPEN_KEY);
    } catch {
      // sessionStorage may be unavailable (private mode, disabled) —
      // fall through to the responsive default.
    }
    if (stored !== null) {
      setInlineOpen(stored === "true");
    } else {
      setInlineOpen(mql.matches);
    }
    setHydrated(true);

    return () => mql.removeEventListener("change", handler);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist the desktop inline state to sessionStorage.
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(SIDEBAR_OPEN_KEY, String(inlineOpen));
    } catch {
      // sessionStorage may be unavailable (private mode, disabled) —
      // the toggle still works, it just won't persist.
    }
  }, [inlineOpen, hydrated]);

  const handleToggle = () => {
    if (isDesktop) {
      setInlineOpen((v) => !v);
    } else {
      setSheetOpen(true);
    }
  };

  // Button label / icon reflect the desktop inline state; on mobile
  // it always reads "Show links" with the open-panel icon.
  const isInlineVisible = hydrated && isDesktop && inlineOpen;
  const Icon = isInlineVisible ? PanelRightClose : PanelRightOpen;

  return (
    <div
      data-testid="item-detail-page"
      className="mx-auto flex w-full max-w-screen-lg flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BackButton fallbackHref="/" />
          {headerActions}
        </div>
        <button
          type="button"
          data-testid="sidebar-toggle"
          onClick={handleToggle}
          aria-expanded={
            hydrated ? (isDesktop ? inlineOpen : sheetOpen) : false
          }
          aria-haspopup="dialog"
          aria-controls={isDesktop ? "item-sidebar" : undefined}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm font-sans text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Icon className="size-4" aria-hidden />
          <span>{isInlineVisible ? "Hide links" : "Show links"}</span>
        </button>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <main
          id="main-content"
          data-testid="item-detail-main"
          className="flex min-w-0 flex-1 flex-col gap-6"
        >
          {children}
        </main>

        {/* Inline aside — rendered only on desktop to avoid double-   */}
        {/* mounting the sidebar content (the sheet holds it on mobile). */}
        {isDesktop && (
          <aside
            id="item-sidebar"
            data-testid="item-sidebar"
            aria-label="Linked items"
            className={cn(
              "w-full shrink-0 lg:w-[30%] lg:max-w-xs",
              inlineOpen ? "block" : "hidden"
            )}
          >
            {sidebar}
          </aside>
        )}
      </div>

      {/* Mobile / tablet overlay sheet. Base UI Dialog only mounts   */}
      {/* the popup content when open, so the sidebar is never double-  */}
      {/* mounted: on desktop the aside owns it; on mobile the sheet. */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[90vw] max-w-xs">
          <SheetHeader>
            <SheetTitle>Links</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pt-2">{sidebar}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
