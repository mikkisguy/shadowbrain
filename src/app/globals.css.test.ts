import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regression test for the design system foundation (issue #20).
 *
 * Reads the source `globals.css` and asserts the ShadowBrain design
 * tokens, font variables, motion defaults, and zero-radius / no-shadow
 * overrides are present. If anyone refactors globals.css and drops a
 * token, this test fails before the change can ship.
 *
 * The hex values are intentionally hard-coded so a token rename alone
 * does not silently change the visual identity.
 */
describe("design system — globals.css tokens", () => {
  const cssPath = resolve(process.cwd(), "src/app/globals.css");
  const css = readFileSync(cssPath, "utf8");

  it("declares the surface tokens from the spec", () => {
    expect(css).toMatch(/--background:\s*#0a0a0a/i);
    expect(css).toMatch(/--foreground:\s*#e4dcc8/i);
    expect(css).toMatch(
      /--surface-elevated:\s*rgba\(228,\s*220,\s*200,\s*0\.03\)/i
    );
    expect(css).toMatch(/--surface-inverted:\s*#e4dcc8/i);
    expect(css).toMatch(/--foreground-inverted:\s*#0a0a0a/i);
    expect(css).toMatch(/--border:\s*rgba\(228,\s*220,\s*200,\s*0\.1\)/i);
    expect(css).toMatch(
      /--border-strong:\s*rgba\(228,\s*220,\s*200,\s*0\.2\)/i
    );
    expect(css).toMatch(
      /--muted-foreground:\s*rgba\(228,\s*220,\s*200,\s*0\.65\)/i
    );
  });

  it("declares the warm surface tokens", () => {
    expect(css).toMatch(/--surface-warm:\s*#322b19/i);
    expect(css).toMatch(/--surface-warm-foreground:\s*#e4dcc8/i);
  });

  it("declares the cool accent tokens", () => {
    expect(css).toMatch(/--primary:\s*#3d6bff/i);
    expect(css).toMatch(/--primary-foreground:\s*#e4dcc8/i);
    expect(css).toMatch(/--accent-cyan:\s*#4fcfff/i);
    expect(css).toMatch(/--accent-violet:\s*#7b6aff/i);
  });

  it("declares the semantic status tokens", () => {
    expect(css).toMatch(/--success:\s*#22c55e/i);
    expect(css).toMatch(/--error:\s*#ef4444/i);
    expect(css).toMatch(/--warning:\s*#f59e0b/i);
    expect(css).toMatch(/--info:\s*#3d6bff/i);
  });

  it("declares all ten type-color tokens", () => {
    const expected: Array<[string, string]> = [
      ["--type-note", "#22c55e"],
      ["--type-bookmark", "#f59e0b"],
      ["--type-journal", "#7c5cfc"],
      ["--type-question", "#14b8a6"],
      ["--type-project", "#ec4899"],
      ["--type-person", "#0ea5e9"],
      ["--type-event", "#f97316"],
      ["--type-dream", "#d946ef"],
      ["--type-raw", "#6b7280"],
      ["--type-image", "#84cc16"],
    ];
    for (const [token, value] of expected) {
      expect(css, `${token} = ${value}`).toMatch(
        new RegExp(`${token}:\\s*${value}`, "i")
      );
    }
  });

  it("exposes font CSS variables for Geist, Newsreader, and JetBrains Mono", () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-sans\)/);
    expect(css).toMatch(/--font-serif:\s*var\(--font-serif\)/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-mono\)/);
  });

  it("sets default motion to 150ms ease-out", () => {
    expect(css).toMatch(/--default-transition-duration:\s*150ms/);
    expect(css).toMatch(
      /--default-transition-timing-function:\s*cubic-bezier\(0,\s*0,\s*0\.2,\s*1\)/
    );
  });

  it("uses a uniform 2px border-radius softening across the scale", () => {
    for (const token of [
      "--radius",
      "--radius-sm",
      "--radius-md",
      "--radius-lg",
      "--radius-xl",
      "--radius-2xl",
      "--radius-3xl",
      "--radius-4xl",
    ]) {
      expect(css, `${token} should be 2px`).toMatch(
        new RegExp(`${token}:\\s*2px`)
      );
    }
  });

  it("disables box-shadow across the scale", () => {
    for (const token of [
      "--shadow-sm",
      "--shadow-md",
      "--shadow-lg",
      "--shadow-xl",
    ]) {
      expect(css, `${token} should be 'none'`).toMatch(
        new RegExp(`${token}:\\s*none`)
      );
    }
  });
});
