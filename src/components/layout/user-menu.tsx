import Link from "next/link";
import { CircleUser } from "lucide-react";

/**
 * User menu — entry point to sign in.
 *
 * When unauthenticated, this is a single link to `/login` styled as
 * an icon button. The auth-aware variant (showing the username and a
 * sign-out action) is intentionally out of scope for this issue —
 * the home page is currently the only authenticated surface, and
 * the logout endpoint is reachable directly via `POST
 * /api/auth/logout`. A future "Phase 3" admin shell will replace
 * this component with a real menu.
 */
export function UserMenu() {
  return (
    <Link
      href="/login"
      data-testid="user-menu"
      aria-label="Sign in"
      className="border-border bg-surface-elevated text-muted-foreground hover:border-border-strong hover:bg-surface-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-sm border transition-colors"
    >
      <CircleUser aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </Link>
  );
}
