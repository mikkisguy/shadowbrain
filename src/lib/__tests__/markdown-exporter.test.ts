import { describe, it, expect } from "vitest";
import type { ContentItem } from "@/db/repositories/content-items";
import {
  contentItemToMarkdown,
  exportItemsAsJson,
  exportItemsAsMarkdown,
} from "@/lib/markdown-exporter";

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    type: "note",
    title: "Hello",
    content: "Body text",
    image_path: null,
    source: "manual",
    source_url: null,
    metadata: JSON.stringify({ mood: "calm" }),
    is_private: 0,
    is_hidden: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("markdown-exporter", () => {
  it("renders frontmatter and body", () => {
    const markdown = contentItemToMarkdown(makeItem());
    expect(markdown).toContain("---");
    expect(markdown).toContain('title: "Hello"');
    expect(markdown).toContain("Body text");
  });

  it("exports arrays as markdown and json", () => {
    const items = [makeItem()];
    expect(exportItemsAsMarkdown(items)).toContain("Body text");
    const json = exportItemsAsJson(items);
    expect(JSON.parse(json)[0].id).toBe("item-1");
    expect(JSON.parse(json)[0].metadata).toEqual({ mood: "calm" });
  });
});
