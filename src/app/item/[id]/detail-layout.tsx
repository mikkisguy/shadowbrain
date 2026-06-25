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
 *   - **Toggle** ([▦]) shows / hides the sidebar. When hidden the
 *     content column expands to the full width.
 *   - **Persistence**: the open/closed choice is written to
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

const SIDEBAR_OPEN_KEY = "item.sidebarOpen";
const DESKTOP_QUERY = "(min-width: 1024px)";

export interface DetailLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

export function DetailLayout({ children, sidebar }: DetailLayoutProps) {
  // First render is closed on both server and client so the hydrated
  // markup matches. The mount effect below resolves the real default.
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Resolve the real default after mount: a stored choice wins,
  // otherwise open on desktop and stay closed on mobile. This runs in
  // an effect (not a lazy `useState` initializer) so the first client
  // render matches the server's `false` and there is no hydration
  // mismatch on the sidebar's visibility class. The state-in-effect
  // rule is disabled because that mismatch-free hydration is exactly
  // the trade-off we want here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(SIDEBAR_OPEN_KEY);
    } catch {
      // sessionStorage may be unavailable (private mode, disabled) —
      // fall through to the responsive default.
    }
    if (stored !== null) {
      setOpen(stored === "true");
    } else if (typeof window.matchMedia === "function") {
      setOpen(window.matchMedia(DESKTOP_QUERY).matches);
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
    } catch {
      // sessionStorage may be unavailable (private mode, disabled) —
      // the toggle still works, it just won't persist.
    }
  }, [open, hydrated]);

  const Icon = open ? PanelRightClose : PanelRightOpen;

  return (
    <div
      data-testid="item-detail-page"
      className="mx-auto flex w-full max-w-screen-lg flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="flex items-center justify-between gap-4">
        <BackButton fallbackHref="/" />
        <button
          type="button"
          data-testid="sidebar-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="item-sidebar"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm font-sans text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Icon className="size-4" aria-hidden />
          <span>{open ? "Hide links" : "Show links"}</span>
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

        <aside
          id="item-sidebar"
          data-testid="item-sidebar"
          aria-label="Linked items"
          className={cn(
            "w-full shrink-0 lg:w-[30%] lg:max-w-xs",
            open ? "block" : "hidden"
          )}
        >
          {sidebar}
        </aside>
      </div>
    </div>
  );
}
