import Link from "next/link";

import { Brain } from "lucide-react";

/**
 * Wordmark + logo lockup for the top nav.
 *
 * Wordmark: Newsreader (serif, brand moments), sentence case, weight
 * 600, per the typographic roles in the design system spec.
 */
export function Brand() {
  return (
    <Link
      href="/"
      className="group/brand focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 outline-none focus-visible:ring-1 focus-visible:ring-offset-2"
      aria-label="ShadowBrain — home"
    >
      <span
        aria-hidden="true"
        className="border-border bg-surface-elevated text-foreground group-hover/brand:border-border-strong flex size-7 items-center justify-center border transition-colors"
      >
        <Brain className="size-4" strokeWidth={1.5} />
      </span>
      <span className="font-serif text-base font-semibold tracking-tight">
        ShadowBrain
      </span>
    </Link>
  );
}
