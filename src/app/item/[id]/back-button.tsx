"use client";

/**
 * Back navigation for the item detail page (issue #25).
 *
 * The acceptance criteria call for both "browser back" and a visible
 * button. This button calls `router.back()` when there is real
 * history to return to, and falls back to `fallbackHref` when the
 * page was reached directly (new tab, external link, deep bookmark) —
 * so the affordance is never a dead end.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export interface BackButtonProps {
  /** Destination when there is no browser history to go back to. */
  fallbackHref?: string;
}

export function BackButton({ fallbackHref = "/" }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      data-testid="item-back-button"
      onClick={() => {
        // `history.length` is 1 on a fresh tab / direct deep link with
        // nothing to go back to — fall back to the Browse feed so the
        // button is never a dead end. (This runs in the browser only,
        // inside an onClick handler, so `window` is always defined.)
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 font-sans text-sm transition-colors"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Back
    </button>
  );
}
