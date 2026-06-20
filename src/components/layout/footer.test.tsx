import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import packageJson from "../../../package.json";

import { Footer } from "@/components/layout/footer";

/**
 * Smoke test for the global app footer.
 *
 * Renders the Footer server-side to static markup and checks the
 * editorial structure: hairline top border, mono-font brand + version
 * row aligned to the `max-w-screen-2xl` content rail. The version
 * must match `package.json` exactly — that's the single source of
 * truth, per `AGENTS.md` "Versioning".
 */
describe("Footer", () => {
  const html = renderToStaticMarkup(<Footer />);

  it("renders a footer element with a hairline top border", () => {
    expect(html).toMatch(/<footer[^>]*data-testid="app-footer"/);
    const footerMatch = html.match(/<footer[^>]*>/);
    expect(footerMatch).not.toBeNull();
    expect(footerMatch![0]).toMatch(/\bborder-t\b/);
    expect(footerMatch![0]).toMatch(/\bborder-border\b/);
  });

  it("renders the version from package.json prefixed with `v`", () => {
    const versionMatch = html.match(
      /<span[^>]*data-testid="app-version"[^>]*>([^<]*)<\/span>/
    );
    expect(versionMatch).not.toBeNull();
    expect(versionMatch![1]).toBe(`v${packageJson.version}`);
  });

  it("renders the brand name in mono font on the left of the row", () => {
    expect(html).toMatch(/>ShadowBrain</);
  });

  it("uses the editorial layout — no rounded corners, no shadows", () => {
    const footerMatch = html.match(/<footer[^>]*>/);
    expect(footerMatch).not.toBeNull();
    expect(footerMatch![0]).not.toMatch(/\brounded-/);
    expect(footerMatch![0]).not.toMatch(/\bshadow-/);
  });
});
