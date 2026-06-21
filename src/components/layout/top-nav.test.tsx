import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { TopNav } from "@/components/layout/top-nav";
import { CommandPaletteProvider } from "@/components/command-palette";

/**
 * Smoke test for the top-nav layout shell.
 *
 * Renders the TopNav server-side to static markup and checks the
 * editorial structure: brand mark, centered palette trigger (with
 * the data-palette-trigger hook the command palette in #88 will
 * attach to), and the user menu placeholder. The theme toggle is
 * out of scope for v1 (ShadowBrain is dark-only).
 *
 * The component itself does not gate on auth — that decision
 * lives in `src/app/layout.tsx`. So this test only covers the
 * "rendered" shape; a layout-level test would assert that
 * `<TopNav />` is not emitted on unauthenticated pages.
 *
 * `TopNav` includes the palette trigger, which now consumes
 * `useCommandPalette` — so the test renders the nav inside
 * the same `CommandPaletteProvider` the root layout uses.
 * Server-side rendering of the provider is safe: the global
 * `keydown` listener only attaches in `useEffect`, which
 * does not run during `renderToStaticMarkup`.
 */
describe("TopNav", () => {
  const html = renderToStaticMarkup(
    <CommandPaletteProvider>
      <TopNav />
    </CommandPaletteProvider>
  );

  it("renders a header element with a hairline bottom border", () => {
    expect(html).toMatch(/<header[^>]*data-testid="top-nav"/);
    // Prettier (with prettier-plugin-tailwindcss) may reorder the
    // utility classes; assert on the individual tokens rather than
    // their adjacency.
    const headerMatch = html.match(/<header[^>]*>/);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch![0]).toMatch(/\bborder-b\b/);
    expect(headerMatch![0]).toMatch(/\bborder-border\b/);
  });

  it("renders the brand mark as a link to home (no wordmark, no frame)", () => {
    // The link's accessible name is still "ShadowBrain — home" so
    // assistive tech knows what the brand is.
    const brandLink = html.match(
      /<a[^>]*aria-label="ShadowBrain — home"[^>]*>/
    );
    expect(brandLink).not.toBeNull();
    expect(brandLink![0]).toMatch(/href="\/"/);

    // The mark is the project logo served from /public.
    const brand =
      brandLink![0] +
      html
        .slice(html.indexOf(brandLink![0]) + brandLink![0].length)
        .split("</a>")[0];
    expect(brand).toMatch(/<img[^>]*src="\/logo\.png"/);
    expect(brand).toMatch(/<img[^>]*width="32"/);
    expect(brand).toMatch(/<img[^>]*height="32"/);
  });

  it("does not render the wordmark text in the nav", () => {
    // The wordmark is a brand-mark-only design now; "ShadowBrain"
    // must appear only in the aria-label, not as a visible <span>.
    expect(html).toMatch(/ShadowBrain/); // still in aria-label
    // Strip the aria-label attribute and confirm no visible "ShadowBrain".
    const visibleText = html.replace(/aria-label="[^"]*"/g, "");
    expect(visibleText).not.toMatch(/ShadowBrain/);
  });

  it("renders the centered palette trigger with the data hook for #88", () => {
    expect(html).toMatch(/data-palette-trigger/);
    expect(html).toMatch(/data-testid="palette-trigger-desktop"/);
    expect(html).toMatch(/data-testid="palette-trigger-mobile"/);
  });

  it("shows the non-Mac shortcut (Ctrl K) on the server-rendered trigger", () => {
    // The server doesn't know the user's platform, so the static
    // markup always uses the non-Mac default. Mac users get the
    // ⌘K label on the client after mount (see palette-trigger.tsx).
    const desktopTrigger = html.match(
      /<button[^>]*data-testid="palette-trigger-desktop"[\s\S]*?<\/button>/
    );
    expect(desktopTrigger).not.toBeNull();
    expect(desktopTrigger![0]).toMatch(/<kbd[^>]*>Ctrl K<\/kbd>/);
    expect(desktopTrigger![0]).toMatch(/aria-label="[^"]*Ctrl K/);
  });

  it("renders the user menu as a sign-out form (no theme toggle in v1)", () => {
    expect(html).toMatch(/data-testid="user-menu"/);
    // The user menu is a form posting to /api/auth/logout. The
    // server clears the cookie and 303-redirects to /login — no
    // JavaScript required, no client component, no broken
    // behaviour when the user has JS disabled.
    expect(html).toMatch(
      /<form[^>]*action="\/api\/auth\/logout"[^>]*method="post"/
    );
    // The signed-in user has no need of a "Sign in" link here.
    expect(html).not.toMatch(/href="\/login"/);
    // v1 is dark-only — no theme toggle is shipped.
    expect(html).not.toMatch(/data-testid="theme-toggle"/);
  });

  it("uses the editorial layout — no rounded corners, no shadows in the nav chrome", () => {
    // The nav container itself shouldn't be a card-style rounded box.
    const headerMatch = html.match(/<header[^>]*>/);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch![0]).not.toMatch(/\brounded-/);
    expect(headerMatch![0]).not.toMatch(/\bshadow-/);
  });
});
