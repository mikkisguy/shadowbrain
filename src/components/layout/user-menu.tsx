import { CircleUser } from "lucide-react";

/**
 * User menu — sign out.
 *
 * The top nav is only rendered when the visitor is authenticated
 * (see `src/app/layout.tsx`), so this component is only ever seen
 * in that state. A plain HTML form posts to `/api/auth/logout`,
 * which clears the session cookie and 303-redirects back to
 * `/login` — no JavaScript required, no client component, the
 * server is the only source of truth for the auth boundary.
 *
 * A future "Phase 3" admin shell will likely replace this with a
 * dropdown that shows the username and a labelled sign-out action;
 * for now the icon-only affordance matches the v1 chrome.
 */
export function UserMenu() {
  return (
    <form
      action="/api/auth/logout"
      method="post"
      data-testid="user-menu"
      aria-label="Sign out"
    >
      <button
        type="submit"
        aria-label="Sign out"
        className="border-border bg-surface-elevated text-muted-foreground hover:border-border-strong hover:bg-surface-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring inline-flex size-8 cursor-pointer items-center justify-center rounded-sm border transition-colors outline-none focus-visible:ring-1 max-md:size-11"
      >
        <CircleUser aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </form>
  );
}
