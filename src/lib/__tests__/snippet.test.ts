import { describe, expect, it } from "vitest";

import { parseSnippet } from "@/lib/snippet";

/**
 * Unit tests for the shared FTS5 snippet parser.
 *
 * The parser is the single source of truth for turning an
 * `/api/search` `snippet` (`…plain <mark>match</mark>…`) into
 * renderable segments. Both the browse feed and the command palette
 * consume it, so the safety + shape contract is pinned here once.
 */
describe("parseSnippet", () => {
  it("returns a single plain segment when there are no marks", () => {
    expect(parseSnippet("no matches here")).toEqual([
      { text: "no matches here", highlight: false },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    // Callers (the card, the palette wrapper) pre-empt an empty
    // snippet with a truthiness guard, but pin the contract so a
    // future caller that forgets the guard renders nothing instead
    // of an empty `<mark>`.
    expect(parseSnippet("")).toEqual([]);
  });

  it("splits a snippet into plain and highlighted segments", () => {
    expect(parseSnippet("a <mark>b</mark> c")).toEqual([
      { text: "a ", highlight: false },
      { text: "b", highlight: true },
      { text: " c", highlight: false },
    ]);
  });

  it("handles a snippet that starts with a match", () => {
    expect(parseSnippet("<mark>x</mark> y")).toEqual([
      { text: "x", highlight: true },
      { text: " y", highlight: false },
    ]);
  });

  it("handles a snippet that ends with a match", () => {
    expect(parseSnippet("y <mark>x</mark>")).toEqual([
      { text: "y ", highlight: false },
      { text: "x", highlight: true },
    ]);
  });

  it("handles multiple matches", () => {
    expect(parseSnippet("<mark>a</mark>-<mark>b</mark>")).toEqual([
      { text: "a", highlight: true },
      { text: "-", highlight: false },
      { text: "b", highlight: true },
    ]);
  });

  it("treats an unterminated <mark> as plain text (drops the marker, keeps the text)", () => {
    // Defensive: a stray opening marker never swallows the rest of
    // the snippet, and the literal "<mark>" token never reaches the
    // user as raw markup.
    expect(parseSnippet("hello <mark>world")).toEqual([
      { text: "hello ", highlight: false },
      { text: "world", highlight: false },
    ]);
  });

  it("preserves the snippet's angle brackets as segment text (callers escape them)", () => {
    // The parser does no escaping itself — it returns the raw text,
    // and the React render site escapes it. A stored `<script>` ends
    // up as a plain segment whose text is the literal markup.
    const parts = parseSnippet("<script>alert(1)</script> <mark>safe</mark>");
    expect(parts).toEqual([
      { text: "<script>alert(1)</script> ", highlight: false },
      { text: "safe", highlight: true },
    ]);
    // The dangerous markup is carried as inert text, never as a
    // highlight, so the render site escapes it rather than executing
    // it.
    expect(parts[0].highlight).toBe(false);
  });
});
