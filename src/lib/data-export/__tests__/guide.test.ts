import { describe, expect, it } from "vitest";
import {
  buildImportTemplate,
  EXPORT_JSON_SCHEMA,
  IMPORT_GUIDE_EXAMPLE_JSON,
  type ShadowbrainExportV1,
} from "@/lib/data-export";
import { exportEnvelopeSchema } from "../schema";

describe("data-export import guide", () => {
  it("describes the required version-one envelope fields", () => {
    expect(EXPORT_JSON_SCHEMA.$schema).toBe(
      "http://json-schema.org/draft-07/schema#"
    );
    expect(EXPORT_JSON_SCHEMA.properties.format.const).toBe(
      "shadowbrain-export"
    );
    expect(EXPORT_JSON_SCHEMA.properties.version.const).toBe(1);
    expect(EXPORT_JSON_SCHEMA.required).toEqual(
      expect.arrayContaining(["format", "version", "items"])
    );
  });

  it("builds a parseable version-one template", () => {
    const template = JSON.parse(
      JSON.stringify(buildImportTemplate())
    ) as ShadowbrainExportV1;

    expect(template.format).toBe("shadowbrain-export");
    expect(template.version).toBe(1);
    expect(template.items).toHaveLength(2);
    expect(template.tags).toHaveLength(1);
    expect(template.journal_periods).toEqual([]);
  });

  it("references existing item and tag IDs", () => {
    const template = buildImportTemplate();
    const itemIds = new Set(template.items.map((item) => item.id));
    const tagIds = new Set(template.tags.map((tag) => tag.id));

    for (const link of template.links) {
      expect(itemIds.has(link.source_id)).toBe(true);
      expect(itemIds.has(link.target_id)).toBe(true);
    }
    for (const itemTag of template.item_tags) {
      expect(itemIds.has(itemTag.content_id)).toBe(true);
      expect(tagIds.has(itemTag.tag_id)).toBe(true);
    }
  });

  it("keeps JSON Schema datetime patterns matching the template timestamp", () => {
    const timestamp = buildImportTemplate().exported_at;
    const patterns = [
      EXPORT_JSON_SCHEMA.properties.exported_at.pattern,
      EXPORT_JSON_SCHEMA.definitions.item.properties.created_at.pattern,
      EXPORT_JSON_SCHEMA.definitions.tag.properties.created_at.pattern,
      EXPORT_JSON_SCHEMA.definitions.item_tag.properties.created_at.pattern,
      EXPORT_JSON_SCHEMA.definitions.link.properties.created_at.pattern,
      EXPORT_JSON_SCHEMA.definitions.journal_period.properties.period_start
        .pattern,
    ];

    for (const pattern of patterns) {
      expect(pattern).toMatch(/\\d/);
      expect(new RegExp(pattern).test(timestamp)).toBe(true);
      expect(new RegExp(pattern).test("2024-01-01")).toBe(false);
    }
  });

  it("keeps the downloadable template and Settings guide sample schema-valid", () => {
    const templateResult = exportEnvelopeSchema.safeParse(
      buildImportTemplate()
    );
    expect(templateResult.success).toBe(true);

    const guideSample = JSON.parse(IMPORT_GUIDE_EXAMPLE_JSON) as unknown;
    const guideResult = exportEnvelopeSchema.safeParse(guideSample);
    expect(guideResult.success).toBe(true);
    expect(guideSample).toEqual(buildImportTemplate());
  });
});
