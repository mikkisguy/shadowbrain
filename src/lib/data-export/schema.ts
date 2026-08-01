import { z } from "zod";
import {
  IMPORT_MAX_CONTENT_LENGTH,
  IMPORT_MAX_ID_LENGTH,
  IMPORT_MAX_ITEM_TAGS,
  IMPORT_MAX_ITEMS,
  IMPORT_MAX_JOURNAL_PERIODS,
  IMPORT_MAX_LINKS,
  IMPORT_MAX_LINK_TYPE_LENGTH,
  IMPORT_MAX_LONG_STRING_LENGTH,
  IMPORT_MAX_METADATA_BYTES,
  IMPORT_MAX_METADATA_DEPTH,
  IMPORT_MAX_METADATA_KEY_LENGTH,
  IMPORT_MAX_METADATA_PROPERTIES,
  IMPORT_MAX_NAME_LENGTH,
  IMPORT_MAX_SOURCE_LENGTH,
  IMPORT_MAX_TAGS,
  IMPORT_MAX_TYPE_LENGTH,
} from "./limits";

const visibilityFlagSchema = z.union([z.literal(0), z.literal(1)]);

/** Strict UTC ISO-8601 datetime with calendar validation (not Date.parse alone). */
const UTC_ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function isCalendarValidUtc(value: string): boolean {
  const match = UTC_ISO_DATETIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0")) || 0;
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  // Construct from a neutral date, then set the full year explicitly so years
  // 0000–0099 are not interpreted as 1900–1999 by Date.UTC.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === milliseconds
  );
}

const isoDateTime = z
  .string()
  .regex(UTC_ISO_DATETIME, {
    message: "Invalid ISO 8601 UTC datetime",
  })
  .refine(isCalendarValidUtc, {
    message: "Invalid ISO 8601 UTC datetime",
  });

function metadataDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== "object") return depth;
  if (depth > IMPORT_MAX_METADATA_DEPTH) return depth;
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (max, entry) => Math.max(max, metadataDepth(entry, depth + 1)),
      depth
    );
  }
  return Object.values(value as Record<string, unknown>).reduce<number>(
    (max, entry) => Math.max(max, metadataDepth(entry, depth + 1)),
    depth
  );
}

const metadataSchema = z
  .record(z.string().max(IMPORT_MAX_METADATA_KEY_LENGTH), z.unknown())
  .nullable()
  .superRefine((value, ctx) => {
    if (value === null) return;
    if (Object.keys(value).length > IMPORT_MAX_METADATA_PROPERTIES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata must have at most ${IMPORT_MAX_METADATA_PROPERTIES} properties`,
      });
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "metadata must be JSON serializable",
      });
      return;
    }
    if (
      new TextEncoder().encode(serialized).byteLength >
      IMPORT_MAX_METADATA_BYTES
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata must be at most ${IMPORT_MAX_METADATA_BYTES} bytes`,
      });
    }
    if (metadataDepth(value) > IMPORT_MAX_METADATA_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata nesting depth must be at most ${IMPORT_MAX_METADATA_DEPTH}`,
      });
    }
  });

const id = (label: string) =>
  z.string().min(1, `${label} must not be empty`).max(IMPORT_MAX_ID_LENGTH);
const type = z
  .string()
  .min(1, "type must not be empty")
  .max(IMPORT_MAX_TYPE_LENGTH);
const longString = z.string().max(IMPORT_MAX_LONG_STRING_LENGTH);
const source = z
  .string()
  .min(1, "source must not be empty")
  .max(IMPORT_MAX_SOURCE_LENGTH);

export const exportItemSchema = z
  .object({
    id: id("id"),
    type,
    title: longString.nullable(),
    content: z.string().max(IMPORT_MAX_CONTENT_LENGTH),
    image_path: longString.nullable(),
    source,
    source_url: longString.nullable(),
    metadata: metadataSchema,
    is_private: visibilityFlagSchema,
    is_hidden: visibilityFlagSchema,
    created_at: isoDateTime,
    updated_at: isoDateTime,
  })
  .strict();

export const exportTagSchema = z
  .object({
    id: id("id"),
    name: z
      .string()
      .min(1, "name must not be empty")
      .max(IMPORT_MAX_NAME_LENGTH),
    color: longString.nullable(),
    created_at: isoDateTime,
  })
  .strict();

export const exportItemTagSchema = z
  .object({
    content_id: id("content_id"),
    tag_id: id("tag_id"),
    created_at: isoDateTime,
  })
  .strict();

export const exportLinkSchema = z
  .object({
    id: id("id"),
    source_id: id("source_id"),
    target_id: id("target_id"),
    link_type: z
      .string()
      .min(1, "link_type must not be empty")
      .max(IMPORT_MAX_LINK_TYPE_LENGTH),
    context: longString.nullable(),
    created_at: isoDateTime,
  })
  .strict();

export const exportJournalPeriodSchema = z
  .object({
    content_id: id("content_id"),
    period_start: isoDateTime,
    period_end: isoDateTime,
    raw_count: z.number().finite().int().nonnegative(),
    model_used: longString.nullable(),
  })
  .strict();

/**
 * Shell schema only: arrays are opaque so a malformed 50k-record payload cannot
 * amplify into hundreds of thousands of Zod issues. Records are validated
 * incrementally by the importer with an early-stop issue budget.
 */
export const exportEnvelopeShellSchema = z
  .object({
    format: z.literal("shadowbrain-export"),
    version: z.literal(1),
    exported_at: isoDateTime,
    items: z.array(z.unknown()).max(IMPORT_MAX_ITEMS),
    tags: z.array(z.unknown()).max(IMPORT_MAX_TAGS),
    item_tags: z.array(z.unknown()).max(IMPORT_MAX_ITEM_TAGS),
    links: z.array(z.unknown()).max(IMPORT_MAX_LINKS),
    journal_periods: z.array(z.unknown()).max(IMPORT_MAX_JOURNAL_PERIODS),
  })
  .strict();

/** Fully typed envelope used after incremental record validation. */
export const exportEnvelopeSchema = z
  .object({
    format: z.literal("shadowbrain-export"),
    version: z.literal(1),
    exported_at: isoDateTime,
    items: z.array(exportItemSchema).max(IMPORT_MAX_ITEMS),
    tags: z.array(exportTagSchema).max(IMPORT_MAX_TAGS),
    item_tags: z.array(exportItemTagSchema).max(IMPORT_MAX_ITEM_TAGS),
    links: z.array(exportLinkSchema).max(IMPORT_MAX_LINKS),
    journal_periods: z
      .array(exportJournalPeriodSchema)
      .max(IMPORT_MAX_JOURNAL_PERIODS),
  })
  .strict();
