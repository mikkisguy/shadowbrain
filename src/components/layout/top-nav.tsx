import { Brand } from "@/components/layout/brand";
import { PaletteTrigger } from "@/components/layout/palette-trigger";
import { UserMenu } from "@/components/layout/user-menu";
import { AddButton } from "@/components/add-dialog";

/**
 * Minimal top navigation shell.
 *
 * Three regions in a flex row with equal `flex-1` bookends so the
 * palette trigger stays optically centered:
 *   1. Brand mark (left)
 *   2. Command palette trigger (center; #88)
 *   3. Add + user menu (right; theme toggle is out of scope for v1 —
 *      ShadowBrain is dark-only)
 *
 * The component itself does not gate on auth. The layout in
 * `src/app/layout.tsx` decides whether to render `<TopNav />` at
 * all — on unauthenticated pages (currently just /login) the nav
 * is omitted entirely, since the login page already carries the
 * brand mark and is a focused authentication surface.
 *
 * Height is 56px; the bottom border is a single hairline in
 * `--border` per the editorial spec. No shadow, no rounding.
 */
export function TopNav() {
  return (
    <header
      className="border-border bg-background sticky top-0 z-40 w-full border-b"
      data-testid="top-nav"
    >
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center justify-start">
          <Brand />
        </div>

        <div className="flex shrink-0 items-center justify-center">
          <PaletteTrigger />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
          <AddButton />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
