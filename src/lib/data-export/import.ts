import Database from "better-sqlite3";
import {
  auditLogs,
  contentItems,
  contentLinks,
  contentTags,
  journalPeriods,
  tags,
} from "@/db/index";
import { IMPORT_MAX_ISSUES } from "./limits";
import { exportEnvelopeShellSchema } from "./schema";
import type { ShadowbrainExportItem, ShadowbrainExportV1 } from "./types";
import {
  findUnknownEnvelopeKey,
  formatIssue,
  parseTypedEnvelope,
  truncateIssueText,
} from "./validate-envelope";

interface ImportSummary {
  mode: "merge";
  created: {
    items: number;
    tags: number;
    item_tags: number;
    /** Number of undirected links imported; each one creates two rows. */
    links: number;
    journal_periods: number;
  };
  reused_tags: number;
  warnings: string[];
}

interface ImportIssue {
  path?: string;
  message: string;
}

interface ImportOptions {
  actorId: string;
  actorType?: string;
  now?: string;
  ip?: string | null;
  userAgent?: string | null;
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Authoritative schema validation reports malformed metadata.
    }
  }
  return null;
}

const LEGACY_REQUIRED_FIELDS = [
  "id",
  "type",
  "title",
  "content",
  "image_path",
  "source",
  "source_url",
  "metadata",
  "is_private",
  "is_hidden",
  "created_at",
  "updated_at",
] as const;

function normalizeLegacyItem(
  raw: unknown,
  index: number
): ShadowbrainExportItem | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: `items[${index}] must be an object` };
  }
  const item = raw as Record<string, unknown>;
  const unknownField = Object.keys(item).find(
    (field) => !(LEGACY_REQUIRED_FIELDS as readonly string[]).includes(field)
  );
  if (unknownField) {
    return {
      error: `items[${index}] contains an unrecognized property`,
    };
  }
  for (const field of LEGACY_REQUIRED_FIELDS) {
    if (!(field in item)) {
      return { error: `items[${index}].${field} is required` };
    }
  }

  for (const field of [
    "id",
    "type",
    "content",
    "source",
    "created_at",
    "updated_at",
  ] as const) {
    if (typeof item[field] !== "string") {
      return { error: `items[${index}].${field} must be a string` };
    }
  }

  const optionalNullableString = (
    field: "title" | "image_path" | "source_url"
  ): string | null | { error: string } => {
    const value = item[field];
    if (value === null) return null;
    if (typeof value !== "string") {
      return { error: `items[${index}].${field} must be a string or null` };
    }
    return value;
  };

  const title = optionalNullableString("title");
  if (title !== null && typeof title === "object") return title;
  const imagePath = optionalNullableString("image_path");
  if (imagePath !== null && typeof imagePath === "object") return imagePath;
  const sourceUrl = optionalNullableString("source_url");
  if (sourceUrl !== null && typeof sourceUrl === "object") return sourceUrl;

  const flag = (
    field: "is_private" | "is_hidden"
  ): 0 | 1 | { error: string } => {
    const value = item[field];
    if (value === 0 || value === false) return 0;
    if (value === 1 || value === true) return 1;
    return { error: `items[${index}].${field} must be 0 or 1` };
  };
  const isPrivate = flag("is_private");
  if (typeof isPrivate === "object") return isPrivate;
  const isHidden = flag("is_hidden");
  if (typeof isHidden === "object") return isHidden;

  let metadata: Record<string, unknown> | null = null;
  if (item.metadata !== null) {
    metadata = normalizeMetadata(item.metadata);
    if (metadata === null) {
      return {
        error: `items[${index}].metadata must be a JSON object or null`,
      };
    }
  }

  return {
    id: item.id as string,
    type: item.type as string,
    title,
    content: item.content as string,
    image_path: imagePath,
    source: item.source as string,
    source_url: sourceUrl,
    metadata,
    is_private: isPrivate,
    is_hidden: isHidden,
    created_at: item.created_at as string,
    updated_at: item.updated_at as string,
  };
}

function normalizeImportData(
  raw: unknown
): ShadowbrainExportV1 | { error: string } | { issues: string[] } {
  if (Array.isArray(raw)) {
    const items: ShadowbrainExportItem[] = [];
    for (const [index, entry] of raw.entries()) {
      const normalized = normalizeLegacyItem(entry, index);
      if ("error" in normalized) return { error: normalized.error };
      items.push(normalized);
    }
    const shellCandidate = {
      format: "shadowbrain-export" as const,
      version: 1 as const,
      exported_at: new Date().toISOString(),
      items,
      tags: [],
      item_tags: [],
      links: [],
      journal_periods: [],
    };
    const shell = exportEnvelopeShellSchema.safeParse(shellCandidate);
    if (!shell.success) {
      return {
        issues: shell.error.issues
          .slice(0, IMPORT_MAX_ISSUES)
          .map((issue) =>
            formatIssue(
              issue.path
                .map((segment) => truncateIssueText(String(segment)))
                .join(".") || "data",
              issue.message
            )
          ),
      };
    }
    const typed = parseTypedEnvelope(shell.data);
    if (!typed.ok) return { issues: typed.issues };
    return typed.data;
  }

  if (typeof raw !== "object" || raw === null) {
    return { error: "Import data must be an object or array" };
  }
  if (findUnknownEnvelopeKey(raw)) {
    return {
      issues: [formatIssue("data", "contains an unrecognized key")],
    };
  }

  const shell = exportEnvelopeShellSchema.safeParse(raw);
  if (!shell.success) {
    return {
      issues: shell.error.issues
        .slice(0, IMPORT_MAX_ISSUES)
        .map((issue) =>
          formatIssue(
            issue.path
              .map((segment) => truncateIssueText(String(segment)))
              .join(".") || "data",
            issue.message
          )
        ),
    };
  }
  const typed = parseTypedEnvelope(shell.data);
  if (!typed.ok) return { issues: typed.issues };
  return typed.data;
}

function duplicateIssues(values: string[], path: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].map((value) =>
    formatIssue(path, `contains duplicate id '${truncateIssueText(value)}'`)
  );
}

function validateImportEnvelope(
  data: ShadowbrainExportV1
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const itemIds = new Set(data.items.map((item) => item.id));
  const tagIds = new Set(data.tags.map((tag) => tag.id));

  const append = (message: string) => {
    if (issues.length < IMPORT_MAX_ISSUES) issues.push(message);
  };

  for (const message of duplicateIssues(
    data.items.map((item) => item.id),
    "items"
  )) {
    append(message);
  }
  for (const message of duplicateIssues(
    data.tags.map((tag) => tag.id),
    "tags"
  )) {
    append(message);
  }
  for (const message of duplicateIssues(
    data.links.map((link) => link.id),
    "links"
  )) {
    append(message);
  }

  const itemTagKeys = new Map<string, Map<string, true>>();
  for (const [index, itemTag] of data.item_tags.entries()) {
    if (issues.length >= IMPORT_MAX_ISSUES) break;
    if (!itemIds.has(itemTag.content_id)) {
      append(
        formatIssue(
          `item_tags[${index}].content_id`,
          "references an unknown item"
        )
      );
    }
    if (!tagIds.has(itemTag.tag_id)) {
      append(
        formatIssue(`item_tags[${index}].tag_id`, "references an unknown tag")
      );
    }
    const byTag =
      itemTagKeys.get(itemTag.content_id) ?? new Map<string, true>();
    if (byTag.has(itemTag.tag_id)) {
      append(
        formatIssue(
          `item_tags[${index}]`,
          "duplicates assignment of the same tag to the same item"
        )
      );
    }
    byTag.set(itemTag.tag_id, true);
    itemTagKeys.set(itemTag.content_id, byTag);
  }

  for (const [index, link] of data.links.entries()) {
    if (issues.length >= IMPORT_MAX_ISSUES) break;
    if (!itemIds.has(link.source_id)) {
      append(
        formatIssue(`links[${index}].source_id`, "references an unknown item")
      );
    }
    if (!itemIds.has(link.target_id)) {
      append(
        formatIssue(`links[${index}].target_id`, "references an unknown item")
      );
    }
    if (link.source_id === link.target_id) {
      append(formatIssue(`links[${index}]`, "must not be a self-link"));
    }
  }

  const periodItems = new Set<string>();
  for (const [index, period] of data.journal_periods.entries()) {
    if (issues.length >= IMPORT_MAX_ISSUES) break;
    if (!itemIds.has(period.content_id)) {
      append(
        formatIssue(
          `journal_periods[${index}].content_id`,
          "references an unknown item"
        )
      );
    }
    if (periodItems.has(period.content_id)) {
      append(
        formatIssue(
          `journal_periods[${index}].content_id`,
          "has more than one journal period"
        )
      );
    }
    periodItems.add(period.content_id);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

class ImportValidationError extends Error {
  constructor(readonly issues: string[]) {
    super("Import payload failed validation");
    this.name = "ImportValidationError";
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function uniqueLogicalLinks(envelope: ShadowbrainExportV1) {
  const byFirst = new Map<
    string,
    Map<string, Map<string, ShadowbrainExportV1["links"][number]>>
  >();
  const unique: ShadowbrainExportV1["links"] = [];
  for (const link of envelope.links) {
    const [first, second] =
      link.source_id < link.target_id
        ? [link.source_id, link.target_id]
        : [link.target_id, link.source_id];
    const bySecond =
      byFirst.get(first) ??
      new Map<string, Map<string, ShadowbrainExportV1["links"][number]>>();
    const byType =
      bySecond.get(second) ??
      new Map<string, ShadowbrainExportV1["links"][number]>();
    if (!byType.has(link.link_type)) {
      byType.set(link.link_type, link);
      unique.push(link);
    }
    bySecond.set(second, byType);
    byFirst.set(first, bySecond);
  }
  return unique;
}

function importExportEnvelope(
  db: Database.Database,
  envelope: ShadowbrainExportV1,
  options: ImportOptions
): ImportSummary {
  const strippedImagePaths = envelope.items.filter(
    (item) => item.image_path !== null
  ).length;
  const items = envelope.items.map((item) => ({ ...item, image_path: null }));
  const links = uniqueLogicalLinks(envelope);
  const now = options.now ?? new Date().toISOString();
  const itemIdMap = new Map<string, string>();
  const tagIdMap = new Map<string, string>();
  const created = {
    items: items.length,
    tags: 0,
    item_tags: 0,
    links: links.length,
    journal_periods: 0,
  };
  let reusedTags = 0;

  const tx = db.transaction(() => {
    for (const item of items) {
      const id = newId();
      itemIdMap.set(item.id, id);
      contentItems.create(db, {
        id,
        type: item.type,
        title: item.title,
        content: item.content,
        image_path: null,
        source: item.source,
        source_url: item.source_url,
        metadata: item.metadata === null ? null : JSON.stringify(item.metadata),
        is_private: item.is_private,
        is_hidden: item.is_hidden,
        created_at: item.created_at,
        updated_at: item.updated_at,
      });
    }

    for (const tag of envelope.tags) {
      const existing = tags.findByName(db, tag.name);
      if (existing) {
        tagIdMap.set(tag.id, existing.id);
        reusedTags += 1;
      } else {
        const id = newId();
        tags.create(db, {
          id,
          name: tag.name,
          color: tag.color,
          created_at: tag.created_at,
        });
        tagIdMap.set(tag.id, id);
        created.tags += 1;
      }
    }

    for (const itemTag of envelope.item_tags) {
      const contentId = itemIdMap.get(itemTag.content_id);
      const tagId = tagIdMap.get(itemTag.tag_id);
      if (!contentId || !tagId) {
        throw new ImportValidationError(["Invalid item tag reference"]);
      }
      created.item_tags += contentTags.addTag(
        db,
        contentId,
        tagId,
        itemTag.created_at
      ).changes;
    }

    for (const link of links) {
      const sourceId = itemIdMap.get(link.source_id);
      const targetId = itemIdMap.get(link.target_id);
      if (!sourceId || !targetId) {
        throw new ImportValidationError(["Invalid link reference"]);
      }
      contentLinks.create(db, {
        id: newId(),
        source_id: sourceId,
        target_id: targetId,
        link_type: link.link_type,
        context: link.context,
        created_at: link.created_at,
      });
      contentLinks.create(db, {
        id: newId(),
        source_id: targetId,
        target_id: sourceId,
        link_type: link.link_type,
        context: link.context,
        created_at: link.created_at,
      });
    }

    for (const period of envelope.journal_periods) {
      const contentId = itemIdMap.get(period.content_id);
      if (!contentId) {
        throw new ImportValidationError(["Invalid journal period reference"]);
      }
      journalPeriods.create(db, {
        content_id: contentId,
        period_start: period.period_start,
        period_end: period.period_end,
        raw_count: period.raw_count,
        model_used: period.model_used,
      });
      created.journal_periods += 1;
    }

    auditLogs.create(db, {
      id: newId(),
      actor_id: options.actorId,
      actor_type: options.actorType ?? "user",
      action: "content.import",
      entity_type: "export",
      entity_id: "json",
      success: 1,
      metadata: JSON.stringify({
        mode: "merge",
        created,
        reused_tags: reusedTags,
      }),
      ip: options.ip ?? null,
      user_agent: options.userAgent ?? null,
      created_at: now,
    });
  });
  tx();

  return {
    mode: "merge",
    created,
    reused_tags: reusedTags,
    warnings:
      strippedImagePaths > 0
        ? [
            `Stripped image_path from ${strippedImagePaths} imported item${
              strippedImagePaths === 1 ? "" : "s"
            }; image binaries are not included.`,
          ]
        : [],
  };
}

export function runJsonImport(
  db: Database.Database,
  rawUnknown: unknown,
  options: ImportOptions
): { ok: true; result: ImportSummary } | { ok: false; issues: ImportIssue[] } {
  const normalized = normalizeImportData(rawUnknown);
  if ("error" in normalized) {
    return {
      ok: false,
      issues: [{ message: truncateIssueText(normalized.error) }],
    };
  }
  if ("issues" in normalized) {
    return {
      ok: false,
      issues: normalized.issues.map((message) => ({ message })),
    };
  }

  const validation = validateImportEnvelope(normalized);
  if (!validation.ok) {
    return {
      ok: false,
      issues: validation.issues.map((message) => ({ message })),
    };
  }

  try {
    return { ok: true, result: importExportEnvelope(db, normalized, options) };
  } catch (error) {
    if (error instanceof ImportValidationError) {
      return {
        ok: false,
        issues: error.issues
          .slice(0, IMPORT_MAX_ISSUES)
          .map((message) => ({ message: truncateIssueText(message) })),
      };
    }
    throw error;
  }
}
