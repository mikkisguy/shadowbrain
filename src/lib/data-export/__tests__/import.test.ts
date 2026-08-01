import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  contentItems,
  contentLinks,
  contentTags,
  journalPeriods,
  tags,
} from "@/db/index";
import { cleanupTestDb, createTestDb } from "@/db/test-utils";
import {
  runJsonImport,
  type ShadowbrainExportItem,
  type ShadowbrainExportV1,
} from "@/lib/data-export";

const baseItem = (
  id: string,
  overrides: Partial<ShadowbrainExportItem> = {}
): ShadowbrainExportItem => ({
  id,
  type: "note",
  title: `Title ${id}`,
  content: `Content ${id}`,
  image_path: null,
  source: "manual",
  source_url: null,
  metadata: null,
  is_private: 0,
  is_hidden: 0,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const minimalEnvelope = (
  overrides: Partial<ShadowbrainExportV1> = {}
): ShadowbrainExportV1 => ({
  format: "shadowbrain-export",
  version: 1,
  exported_at: "2024-01-01T00:00:00.000Z",
  items: [baseItem("item-1")],
  tags: [],
  item_tags: [],
  links: [],
  journal_periods: [],
  ...overrides,
});

const importOptions = {
  actorId: "test-user",
  now: "2024-01-02T00:00:00.000Z",
};

describe("runJsonImport", () => {
  let db: Database.Database;

  beforeEach(() => {
    cleanupTestDb();
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
    cleanupTestDb();
  });

  it("merges linked items, journal data, and tags while reusing tags by name", () => {
    const envelope = minimalEnvelope({
      items: [
        baseItem("source-a", { content: "First item" }),
        baseItem("source-b", { content: "Second item" }),
      ],
      tags: [
        {
          id: "export-tag",
          name: "shared-tag",
          color: "#123456",
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      item_tags: [
        {
          content_id: "source-a",
          tag_id: "export-tag",
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      links: [
        {
          id: "export-link",
          source_id: "source-a",
          target_id: "source-b",
          link_type: "reference",
          context: "related",
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      journal_periods: [
        {
          content_id: "source-a",
          period_start: "2024-01-01T00:00:00.000Z",
          period_end: "2024-01-01T01:00:00.000Z",
          raw_count: 3,
          model_used: "test-model",
        },
      ],
    });

    const first = runJsonImport(db, envelope, importOptions);
    expect(first.ok).toBe(true);
    if (!first.ok)
      throw new Error(first.issues.map((issue) => issue.message).join("; "));

    expect(first.result.created).toEqual({
      items: 2,
      tags: 1,
      item_tags: 1,
      links: 1,
      journal_periods: 1,
    });

    const rows = contentItems.findAll(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).not.toContain("source-a");
    expect(rows.map((row) => row.id)).not.toContain("source-b");
    const importedA = rows.find((row) => row.content === "First item");
    const importedB = rows.find((row) => row.content === "Second item");
    expect(importedA).toBeDefined();
    expect(importedB).toBeDefined();
    if (!importedA || !importedB) return;

    expect(
      contentLinks.existsBetween(db, importedA.id, importedB.id, "reference")
    ).toBe(true);
    expect(
      contentLinks.existsBetween(db, importedB.id, importedA.id, "reference")
    ).toBe(true);
    expect(contentLinks.findAll(db)).toHaveLength(2);
    expect(tags.findAll(db)).toHaveLength(1);
    expect(contentTags.findAll(db)).toEqual([
      expect.objectContaining({ content_id: importedA.id }),
    ]);
    expect(journalPeriods.findAll(db)).toEqual([
      expect.objectContaining({ content_id: importedA.id, raw_count: 3 }),
    ]);

    const second = runJsonImport(db, envelope, importOptions);
    expect(second.ok).toBe(true);
    if (!second.ok)
      throw new Error(second.issues.map((issue) => issue.message).join("; "));
    expect(second.result.reused_tags).toBe(1);
    expect(second.result.created.tags).toBe(0);
    expect(tags.findAll(db)).toHaveLength(1);
  });

  it("does not overwrite an existing item with the same source id", () => {
    contentItems.create(db, {
      id: "same-source-id",
      type: "note",
      title: "Existing title",
      content: "Existing content",
      image_path: null,
      source: "manual",
      source_url: null,
      metadata: null,
      is_private: 0,
      is_hidden: 0,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    });

    const result = runJsonImport(
      db,
      minimalEnvelope({
        items: [
          baseItem("same-source-id", {
            title: "Imported title",
            content: "Imported content",
          }),
        ],
      }),
      importOptions
    );

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error(result.issues.map((issue) => issue.message).join("; "));
    expect(result.result.created.items).toBe(1);

    const rows = contentItems.findAll(db);
    expect(rows).toHaveLength(2);
    expect(contentItems.findById(db, "same-source-id")?.content).toBe(
      "Existing content"
    );
    expect(
      rows.some(
        (row) =>
          row.id !== "same-source-id" && row.content === "Imported content"
      )
    ).toBe(true);
  });

  it("rejects a self-link before creating any content items", () => {
    const result = runJsonImport(
      db,
      minimalEnvelope({
        links: [
          {
            id: "self-link",
            source_id: "item-1",
            target_id: "item-1",
            link_type: "reference",
            context: null,
            created_at: "2024-01-01T00:00:00.000Z",
          },
        ],
      }),
      importOptions
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some((issue) => issue.message.includes("self-link"))
    ).toBe(true);
    expect(contentItems.findAll(db)).toHaveLength(0);
  });

  it("imports a legacy bare array as items only", () => {
    const result = runJsonImport(
      db,
      [
        {
          id: "legacy-item",
          type: "note",
          title: null,
          content: "Legacy content",
          image_path: null,
          source: "manual",
          source_url: null,
          metadata: null,
          is_private: 0,
          is_hidden: 0,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      importOptions
    );

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error(result.issues.map((issue) => issue.message).join("; "));
    expect(result.result.created).toEqual({
      items: 1,
      tags: 0,
      item_tags: 0,
      links: 0,
      journal_periods: 0,
    });
    expect(contentItems.findAll(db)).toEqual([
      expect.objectContaining({ type: "note", content: "Legacy content" }),
    ]);
    expect(tags.findAll(db)).toHaveLength(0);
    expect(contentLinks.findAll(db)).toHaveLength(0);
  });

  it("rejects invalid timestamps before writing", () => {
    // Sanity: the regression cases below are accepted by Date.parse but
    // are not strict UTC ISO-8601 (…Z) datetimes.
    expect(Number.isNaN(Date.parse("2024-01-01"))).toBe(false);
    expect(Number.isNaN(Date.parse("March 15, 2024"))).toBe(false);

    const invalidExportedAt = runJsonImport(
      db,
      minimalEnvelope({ exported_at: "not-a-timestamp" }),
      importOptions
    );
    expect(invalidExportedAt.ok).toBe(false);
    if (invalidExportedAt.ok) return;
    expect(
      invalidExportedAt.issues.some((issue) =>
        /exported_at|datetime|ISO 8601/i.test(issue.message)
      )
    ).toBe(true);
    expect(contentItems.findAll(db)).toHaveLength(0);

    // Date-only strings parse in JS but must be rejected as non-ISO UTC.
    const dateOnly = runJsonImport(
      db,
      minimalEnvelope({ exported_at: "2024-01-01" }),
      importOptions
    );
    expect(dateOnly.ok).toBe(false);
    if (dateOnly.ok) return;
    expect(
      dateOnly.issues.some((issue) =>
        /exported_at|datetime|ISO 8601/i.test(issue.message)
      )
    ).toBe(true);
    expect(contentItems.findAll(db)).toHaveLength(0);

    const localeDate = runJsonImport(
      db,
      minimalEnvelope({
        items: [baseItem("bad-time", { created_at: "March 15, 2024" })],
      }),
      importOptions
    );
    expect(localeDate.ok).toBe(false);
    if (localeDate.ok) return;
    expect(
      localeDate.issues.some((issue) =>
        /created_at|datetime|ISO 8601/i.test(issue.message)
      )
    ).toBe(true);
    expect(contentItems.findAll(db)).toHaveLength(0);

    const invalidJournalBound = runJsonImport(
      db,
      minimalEnvelope({
        journal_periods: [
          {
            content_id: "item-1",
            period_start: "2024-01-01",
            period_end: "2024-01-01T01:00:00.000Z",
            raw_count: 1,
            model_used: null,
          },
        ],
      }),
      importOptions
    );
    expect(invalidJournalBound.ok).toBe(false);
    if (invalidJournalBound.ok) return;
    expect(
      invalidJournalBound.issues.some((issue) =>
        /period_start|datetime|ISO 8601/i.test(issue.message)
      )
    ).toBe(true);
    expect(contentItems.findAll(db)).toHaveLength(0);
  });

  it("rejects duplicate item_tags before writing", () => {
    const result = runJsonImport(
      db,
      minimalEnvelope({
        tags: [
          {
            id: "tag-1",
            name: "dup-tag",
            color: null,
            created_at: "2024-01-01T00:00:00.000Z",
          },
        ],
        item_tags: [
          {
            content_id: "item-1",
            tag_id: "tag-1",
            created_at: "2024-01-01T00:00:00.000Z",
          },
          {
            content_id: "item-1",
            tag_id: "tag-1",
            created_at: "2024-01-01T00:00:01.000Z",
          },
        ],
      }),
      importOptions
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some((issue) =>
        /item_tags.*duplicates|duplicates assignment/i.test(issue.message)
      )
    ).toBe(true);
    expect(contentItems.findAll(db)).toHaveLength(0);
  });

  it("reports a warning when an imported item has an image path", () => {
    const result = runJsonImport(
      db,
      minimalEnvelope({
        items: [baseItem("image-item", { image_path: "/images/item.jpg" })],
      }),
      importOptions
    );

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error(result.issues.map((issue) => issue.message).join("; "));
    expect(result.result.warnings.length).toBeGreaterThan(0);
  });

  it("bounds validation work for 50_000 empty item objects", () => {
    const started = Date.now();
    const result = runJsonImport(
      db,
      {
        format: "shadowbrain-export",
        version: 1,
        exported_at: "2024-01-01T00:00:00.000Z",
        items: Array.from({ length: 50_000 }, () => ({})),
        tags: [],
        item_tags: [],
        links: [],
        journal_periods: [],
      },
      importOptions
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.length).toBeLessThanOrEqual(50);
    expect(result.issues.every((issue) => issue.message.length <= 200)).toBe(
      true
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(contentItems.findAll(db)).toHaveLength(0);
  });

  it("truncates extremely long validation messages", () => {
    const huge = "x".repeat(100_000);
    const result = runJsonImport(
      db,
      {
        format: "shadowbrain-export",
        version: 1,
        exported_at: "2024-01-01T00:00:00.000Z",
        items: [],
        tags: [],
        item_tags: [],
        links: [],
        journal_periods: [],
        [huge]: true,
      },
      importOptions
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.message.length <= 200)).toBe(
      true
    );
  });

  it("rejects legacy items missing is_private without writing", () => {
    const result = runJsonImport(
      db,
      [
        {
          id: "legacy-item",
          type: "note",
          title: null,
          content: "Legacy content",
          image_path: null,
          source: "manual",
          source_url: null,
          metadata: null,
          is_hidden: 0,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      importOptions
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some((issue) => /is_private/i.test(issue.message))
    ).toBe(true);
    expect(contentItems.findAll(db)).toHaveLength(0);
  });
});
