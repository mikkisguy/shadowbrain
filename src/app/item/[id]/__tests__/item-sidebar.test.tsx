import { describe, it, expect } from "vitest";
import {
  formatLinkType,
  getDefaultLinkType,
  getLinkTypeOptions,
} from "../item-sidebar";

describe("formatLinkType", () => {
  it("converts kebab-case to spaced words", () => {
    expect(formatLinkType("depends-on")).toBe("depends on");
    expect(formatLinkType("related-to")).toBe("related to");
  });

  it("converts snake_case to spaced words", () => {
    expect(formatLinkType("happened_during")).toBe("happened during");
    expect(formatLinkType("bookmarked_for")).toBe("bookmarked for");
  });

  it("passes single-word types through unchanged", () => {
    expect(formatLinkType("references")).toBe("references");
    expect(formatLinkType("contradicts")).toBe("contradicts");
  });
});

describe("getDefaultLinkType", () => {
  it("returns happened_during for task item type", () => {
    expect(getDefaultLinkType("task")).toBe("happened_during");
  });

  it("returns happened_during for event item type", () => {
    expect(getDefaultLinkType("event")).toBe("happened_during");
  });

  it("returns references for other item types", () => {
    expect(getDefaultLinkType("bookmark")).toBe("references");
    expect(getDefaultLinkType("note")).toBe("references");
    expect(getDefaultLinkType("person")).toBe("references");
    expect(getDefaultLinkType("project")).toBe("references");
    expect(getDefaultLinkType("image")).toBe("references");
  });

  it("returns references for unknown item types", () => {
    expect(getDefaultLinkType("unknown_type")).toBe("references");
  });
});

describe("getLinkTypeOptions", () => {
  it("puts happened_during first for task items", () => {
    const options = getLinkTypeOptions("task");
    expect(options[0]?.value).toBe("happened_during");
    expect(options.map((o) => o.value)).toContain("references");
  });

  it("puts happened_during first for event items", () => {
    expect(getLinkTypeOptions("event")[0]?.value).toBe("happened_during");
  });

  it("keeps default order for other item types", () => {
    expect(getLinkTypeOptions("note")[0]?.value).toBe("references");
    expect(getLinkTypeOptions("project")[0]?.value).toBe("references");
  });
});
