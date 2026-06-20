import { Brand } from "@/components/layout/brand";
import { PaletteTrigger } from "@/components/layout/palette-trigger";
import { UserMenu } from "@/components/layout/user-menu";

/**
 * Minimal top navigation shell.
 *
 * Three regions in a CSS grid:
 *   1. Logo + brand (left)
 *   2. Centered palette trigger (the global command palette lives in
 *      #88; the trigger itself is a stub here)
 *   3. User menu placeholder (right; the theme toggle is out of
 *      scope for v1 — ShadowBrain is dark-only)
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
      <div className="mx-auto grid h-14 w-full max-w-screen-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center justify-start">
          <Brand />
        </div>

        <div className="flex items-center justify-center">
          <PaletteTrigger />
        </div>

        <div className="flex items-center justify-end gap-2">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
