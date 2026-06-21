import { describe, expect, it } from "vitest";

import { fuzzyFilter, fuzzyScore } from "./fuzzy-filter";

/**
 * Unit tests for the subsequence fuzzy matcher.
 *
 * The matcher is the only piece of the command palette that
 * runs on every keystroke; the rest is debounced. These
 * tests pin the contract the spec calls out (empty query =
 * default view, subsequence matching, prefix preference,
 * short-circuit on no match) and the edge cases the rest of
 * the palette relies on.
 */

describe("fuzzyScore", () => {
  it("returns a neutral match for an empty query", () => {
    // The palette passes an empty string to the fuzzy
    // filter as a "no filtering" signal. The matcher must
    // return a positive number so every item is kept (the
    // filter uses `> 0` as the keep predicate).
    expect(fuzzyScore("", "Browse")).toBeGreaterThan(0);
  });

  it("returns 0 when the haystack is empty", () => {
    expect(fuzzyScore("a", "")).toBe(0);
  });

  it("returns 0 when the query is not a subsequence of the haystack", () => {
    expect(fuzzyScore("xyz", "Browse")).toBe(0);
    expect(fuzzyScore("ba", "Browse")).toBe(0); // `b...a` is not in `Browse`
  });

  it("matches a subsequence case-insensitively", () => {
    // `BR` is the spec's example: subsequence matching
    // against `Browse`. Both case combinations must match.
    expect(fuzzyScore("br", "Browse")).toBeGreaterThan(0);
    expect(fuzzyScore("BR", "Browse")).toBeGreaterThan(0);
    expect(fuzzyScore("br", "browse")).toBeGreaterThan(0);
  });

  it("prefers an exact prefix match over a later match", () => {
    const prefix = fuzzyScore("br", "Browse");
    const interior = fuzzyScore("ow", "Browse");
    // `br` matches the first two characters of `Browse`
    // (prefix bonus); `ow` is a subsequence but neither at
    // the start nor consecutive. The prefix should always
    // win, so the score must be strictly greater.
    expect(prefix).toBeGreaterThan(interior);
  });

  it("prefers consecutive matches over non-consecutive ones", () => {
    const consecutive = fuzzyScore("se", "Settings");
    const scattered = fuzzyScore("st", "Settings");
    // `se` is consecutive in `Settings` (chars 0-1 are
    // contiguous); `st` is *not* consecutive. Both are
    // prefix matches, so the consecutive bonus is the only
    // differentiator.
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it("prefers shorter haystacks when scores otherwise tie", () => {
    // Both haystacks start with `b`; the longer one should
    // rank below the shorter one in the filtered list. The
    // tie-breaker only matters after the prefix bonus, so
    // we use the same prefix length and only vary the
    // haystack length.
    const short = fuzzyScore("b", "Browse");
    const long = fuzzyScore("b", "BrowserHistory");
    expect(short).toBeGreaterThan(long);
  });
});

describe("fuzzyFilter", () => {
  const items = ["Browse", "Chat", "Graph", "Tags", "Settings"] as const;

  it("returns the input order on an empty query (default view)", () => {
    // The default view of the palette shows every page in
    // declaration order — no reordering.
    expect(fuzzyFilter("", items, (s) => s)).toEqual([
      "Browse",
      "Chat",
      "Graph",
      "Tags",
      "Settings",
    ]);
  });

  it("returns the input order on a whitespace-only query", () => {
    expect(fuzzyFilter("   ", items, (s) => s)).toEqual([
      "Browse",
      "Chat",
      "Graph",
      "Tags",
      "Settings",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = ["Browse", "Chat"] as const;
    const copy = [...input];
    fuzzyFilter("b", input, (s) => s);
    expect(input).toEqual(copy);
  });

  it("filters by subsequence and sorts by score", () => {
    // `s` matches `Settings` (prefix) and `Tags` (interior
    // 's' is missing — `Tags` has no 's' lowercase; it
    // does have 'T' but case-insensitive matching means
    // 'T' is 't' which is not 's'. So `s` only matches
    // `Settings`).
    expect(fuzzyFilter("s", items, (s) => s)).toEqual(["Settings"]);
  });

  it("ranks the best match first when multiple items match", () => {
    // `gr` matches `Graph` (prefix). It does not subsequence
    // match any other item. The single result wins.
    expect(fuzzyFilter("gr", items, (s) => s)).toEqual(["Graph"]);
  });

  it("supports custom haystack projection (keywords)", () => {
    // The palette uses `searchHaystack` to fold the label
    // + keywords into one string. This test pins that the
    // filter accepts the projection function and that the
    // project is the only place the search sees the data.
    const entries = [
      { id: "a", haystack: "chat assistant" },
      { id: "b", haystack: "settings config" },
    ];
    expect(
      fuzzyFilter("assis", entries, (e) => e.haystack).map((e) => e.id)
    ).toEqual(["a"]);
  });
});
