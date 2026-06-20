import { CircleUser } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * User menu placeholder.
 *
 * Authentication is not yet wired up (Phase 1 — Core Data Layer has
 * the API surface, but no session is required to view the home
 * page). This button is a non-interactive placeholder so the nav has
 * the right silhouette until the auth flow lands.
 *
 * Rendered as a server component: there is no interactivity to
 * hydrate, and the surrounding Button component is the only client
 * island (it ships its own minimal runtime).
 */
export function UserMenu() {
  return (
    <Button
      variant="outline"
      size="icon"
      data-testid="user-menu"
      disabled
      aria-label="Sign in (coming soon)"
      className="border-border bg-surface-elevated text-muted-foreground hover:border-border-strong hover:bg-surface-muted hover:text-foreground"
    >
      <CircleUser aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </Button>
  );
}
