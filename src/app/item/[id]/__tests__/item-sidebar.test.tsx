import { describe, it, expect } from "vitest";
import { formatLinkType } from "../item-sidebar";

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
