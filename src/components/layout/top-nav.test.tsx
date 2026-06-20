import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { TopNav } from "@/components/layout/top-nav";

/**
 * Smoke test for the top-nav layout shell.
 *
 * Renders the TopNav server-side to static markup and checks the
 * editorial structure: brand, centered palette trigger (with the
 * data-palette-trigger hook the command palette in #88 will attach
 * to), theme toggle, and user menu placeholder.
 *
 * The nav has very little logic; the value of this test is in
 * catching structural regressions if the layout is refactored.
 */
describe("TopNav", () => {
  const html = renderToStaticMarkup(<TopNav />);

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

  it("renders the brand wordmark as a link to home", () => {
    expect(html).toMatch(/ShadowBrain/);
    // Next's <Link> renders the aria-label before href in the static
    // markup; assert both attributes are present on the same <a>.
    const brandLink = html.match(
      /<a[^>]*aria-label="ShadowBrain — home"[^>]*>/
    );
    expect(brandLink).not.toBeNull();
    expect(brandLink![0]).toMatch(/href="\/"/);
  });

  it("renders the centered palette trigger with the data hook for #88", () => {
    expect(html).toMatch(/data-palette-trigger/);
    expect(html).toMatch(/data-testid="palette-trigger-desktop"/);
    expect(html).toMatch(/data-testid="palette-trigger-mobile"/);
  });

  it("renders the theme toggle and user menu placeholders", () => {
    expect(html).toMatch(/data-testid="theme-toggle"/);
    expect(html).toMatch(/data-testid="user-menu"/);
  });

  it("uses the editorial layout — no rounded corners, no shadows in the nav chrome", () => {
    // The nav container itself shouldn't be a card-style rounded box.
    const headerMatch = html.match(/<header[^>]*>/);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch![0]).not.toMatch(/\brounded-/);
    expect(headerMatch![0]).not.toMatch(/\bshadow-/);
  });
});
