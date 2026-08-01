import { describe, expect, it } from "vitest";
import { buildExportEnvelope, exportAsJsonString } from "@/lib/data-export";

const item = (id: string, metadata: string | null) => ({
  id,
  type: "note",
  title: `Item ${id}`,
  content: "Some content",
  image_path: null,
  source: "manual",
  source_url: null,
  metadata,
  is_private: 0,
  is_hidden: 0,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
});

const emptyInput = () => ({
  items: [],
  tags: [],
  itemTags: [],
  links: [],
  journalPeriods: [],
  exportedAt: "2024-01-01T00:00:00.000Z",
});

describe("data-export serialization", () => {
  it("keeps null metadata, parses valid JSON, and normalizes malformed JSON", () => {
    const envelope = buildExportEnvelope({
      ...emptyInput(),
      items: [
        item("null-metadata", null),
        item("valid-metadata", '{"mood":"focused","count":2}'),
        item("malformed-metadata", "not-json"),
      ],
    });

    expect(envelope.items.map(({ metadata }) => metadata)).toEqual([
      null,
      { mood: "focused", count: 2 },
      {},
    ]);
  });

  it("deduplicates reverse link pairs with the same type", () => {
    const envelope = buildExportEnvelope({
      ...emptyInput(),
      links: [
        {
          id: "link-forward",
          source_id: "item-a",
          target_id: "item-b",
          link_type: "reference",
          context: "forward",
          created_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "link-reverse",
          source_id: "item-b",
          target_id: "item-a",
          link_type: "reference",
          context: "reverse",
          created_at: "2024-01-01T00:00:01.000Z",
        },
      ],
    });

    expect(envelope.links).toHaveLength(1);
    expect(envelope.links[0]).toMatchObject({
      id: "link-forward",
      source_id: "item-a",
      target_id: "item-b",
      link_type: "reference",
    });
  });

  it("pretty-prints JSON that round-trips to the export envelope", () => {
    const envelope = buildExportEnvelope({
      ...emptyInput(),
      items: [item("round-trip", '{"ok":true}')],
    });

    const json = exportAsJsonString(envelope);

    expect(json).toContain('\n  "format":');
    expect(JSON.parse(json)).toEqual(envelope);
    expect(JSON.parse(json)).toMatchObject({
      format: "shadowbrain-export",
      version: 1,
    });
  });
});
