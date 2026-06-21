import { describe, expect, it } from "vitest";

import { allItems, pages, searchHaystack, utilities } from "./command-items";

/**
 * The static catalogue is the source of truth for the
 * palette's "Pages" and "Utilities" groups. These tests pin
 * the contract the spec calls out:
 *
 *   - 5 page entries (Browse, Chat, Graph, Tags, Settings)
 *   - The `/search` route is NOT in the page list (the spec
 *     removes the dedicated search page in favour of the
 *     palette's content search)
 *   - Stable IDs in a fixed order
 *   - `searchHaystack` includes both the label and any
 *     keywords (so the fuzzy filter matches `home` against
 *     `Browse`, for example).
 */

describe("command-items catalogue", () => {
  it("exposes exactly 5 page entries in a fixed order", () => {
    expect(pages.map((p) => p.label)).toEqual([
      "Browse",
      "Chat",
      "Graph",
      "Tags",
      "Settings",
    ]);
  });

  it("does not include a /search route in the page list", () => {
    // The design spec removes the dedicated search page;
    // content search lives in the palette. Pin the absence
    // here so a future refactor that re-adds the route has
    // to remove it from the catalogue as well.
    expect(pages.find((p) => p.href === "/search")).toBeUndefined();
  });

  it("exposes a sign-out utility item (only utility in v1)", () => {
    expect(utilities).toHaveLength(1);
    expect(utilities[0]?.action).toBe("signOut");
  });

  it("uses stable string IDs for every item", () => {
    const ids = allItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("includes /chat, /graph, /tags, /settings as page hrefs", () => {
    // The acceptance criteria promise all 5 routes are
    // reachable from the palette's default view. Pin the
    // hrefs so a typo cannot silently ship a broken link.
    const hrefs = pages.map((p) => p.href);
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/chat");
    expect(hrefs).toContain("/graph");
    expect(hrefs).toContain("/tags");
    expect(hrefs).toContain("/settings");
  });
});

describe("searchHaystack", () => {
  it("includes the page label", () => {
    const browse = pages.find((p) => p.label === "Browse");
    expect(browse).toBeDefined();
    expect(searchHaystack(browse!)).toContain("Browse");
  });

  it("includes any keywords the item declares", () => {
    // The fuzzy filter scores against this haystack, so a
    // page that declares `home` as a keyword must match a
    // user typing `home`.
    const browse = pages.find((p) => p.label === "Browse")!;
    expect(searchHaystack(browse)).toContain("home");
  });

  it("uses just the label for utility items", () => {
    const [signOut] = utilities;
    expect(signOut).toBeDefined();
    expect(searchHaystack(signOut!)).toBe("Sign out");
  });
});
