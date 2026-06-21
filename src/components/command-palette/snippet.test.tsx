import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderSnippet, typeBadgeClasses } from "./snippet";

/**
 * The snippet renderer is the only HTML-interpolation site
 * in the command palette. The tests pin the safety contract
 * (no `dangerouslySetInnerHTML` of raw snippet text) and the
 * rendering contract (matched terms get a `<mark>` wrapper,
 * other text is escaped by React).
 */

describe("renderSnippet", () => {
  it("returns null for a null input", () => {
    expect(renderSnippet(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(renderSnippet("")).toBeNull();
  });

  it("renders plain text without `<mark>` markers", () => {
    const html = renderToStaticMarkup(<>{renderSnippet("hello world")}</>);
    expect(html).toBe("<span>hello world</span>");
  });

  it("wraps matched terms in a `<mark>` element", () => {
    // The typical FTS5 shape: `Hello <mark>world</mark>`.
    const html = renderToStaticMarkup(
      <>{renderSnippet("Hello <mark>world</mark>")}</>
    );
    expect(html).toContain("<mark>world</mark>");
    expect(html).toContain("Hello ");
  });

  it("renders multiple mark runs", () => {
    const html = renderToStaticMarkup(
      <>{renderSnippet("a <mark>b</mark> c <mark>d</mark> e")}</>
    );
    expect(html).toContain("<mark>b</mark>");
    expect(html).toContain("<mark>d</mark>");
    expect(html).toMatch(
      /<span>a <\/span>.*<mark>b<\/mark>.*<span> c <\/span>/
    );
  });

  it("escapes text outside the marks so the snippet is XSS-safe", () => {
    // An attacker who lands `<script>` in a note would get
    // it executed if the palette used dangerouslySetInnerHTML.
    // The renderer instead produces escaped text inside a
    // <span>, so React's default escaping keeps the angle
    // brackets as plain text.
    const html = renderToStaticMarkup(
      <>{renderSnippet("<script>alert(1)</script> <mark>safe</mark>")}</>
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<mark>safe</mark>");
  });

  it("treats an unterminated `<mark>` as plain text", () => {
    // Defensive: an unterminated <mark> would otherwise eat
    // the rest of the snippet. The renderer bails out to
    // text rendering so the palette never loses content.
    const html = renderToStaticMarkup(
      <>{renderSnippet("hello <mark>world")}</>
    );
    expect(html).not.toContain("<mark>");
    expect(html).toContain("hello ");
    expect(html).toContain("world");
  });
});

describe("typeBadgeClasses", () => {
  it("returns a token class for every known content type", () => {
    const known = [
      "note",
      "bookmark",
      "journal",
      "question",
      "project",
      "person",
      "event",
      "dream",
      "raw",
    ];
    for (const t of known) {
      const cls = typeBadgeClasses(t);
      expect(cls).toMatch(new RegExp(`^bg-type-${t}$`));
    }
  });

  it("falls back to the raw token for unknown types", () => {
    // A future content type that isn't in the colour
    // vocabulary should not blow up — the badge still
    // renders, just with the neutral raw colour.
    expect(typeBadgeClasses("not-a-real-type")).toBe("bg-type-raw");
  });
});
