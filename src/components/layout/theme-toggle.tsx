import { Moon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Theme toggle placeholder.
 *
 * The design system spec marks theme switching as out of scope for v1
 * (dark-only). The button is rendered as a clear placeholder so the
 * nav has the right silhouette, but it is non-interactive until a
 * future issue adds the toggle behavior.
 *
 * Rendered as a server component: there is no interactivity to
 * hydrate, and the surrounding Button component is the only client
 * island (it ships its own minimal runtime).
 */
export function ThemeToggle() {
  return (
    <Button
      variant="outline"
      size="icon"
      data-testid="theme-toggle"
      disabled
      aria-label="Toggle theme (light mode coming in a future release)"
      className="border-border bg-surface-elevated text-muted-foreground hover:border-border-strong hover:bg-surface-muted hover:text-foreground"
    >
      <Moon aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </Button>
  );
}
