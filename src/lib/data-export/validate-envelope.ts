import type { z } from "zod";
import { IMPORT_MAX_ISSUE_MESSAGE_LENGTH, IMPORT_MAX_ISSUES } from "./limits";
import {
  exportEnvelopeShellSchema,
  exportItemSchema,
  exportItemTagSchema,
  exportJournalPeriodSchema,
  exportLinkSchema,
  exportTagSchema,
} from "./schema";
import type { ShadowbrainExportV1 } from "./types";

/**
 * Top-level envelope keys accepted by v1. Checked before Zod `.strict()` so a
 * single adversarial property name cannot amplify into a multi-megabyte issue.
 */
const EXPORT_ENVELOPE_KEYS = [
  "format",
  "version",
  "exported_at",
  "items",
  "tags",
  "item_tags",
  "links",
  "journal_periods",
] as const;

const EXPORT_ENVELOPE_KEY_SET: ReadonlySet<string> = new Set(
  EXPORT_ENVELOPE_KEYS
);

export function truncateIssueText(value: string): string {
  if (value.length <= IMPORT_MAX_ISSUE_MESSAGE_LENGTH) return value;
  return `${value.slice(0, IMPORT_MAX_ISSUE_MESSAGE_LENGTH - 1)}…`;
}

export function formatIssue(path: string, message: string): string {
  return truncateIssueText(
    `${truncateIssueText(path || "data")}: ${truncateIssueText(message)}`
  );
}

/** Reject unknown top-level keys without embedding the raw key in the message. */
export function findUnknownEnvelopeKey(raw: object): string | undefined {
  return Object.keys(raw).find((key) => !EXPORT_ENVELOPE_KEY_SET.has(key));
}

function pushZodIssues(
  issues: string[],
  pathPrefix: string,
  zodIssues: Array<{ path: PropertyKey[]; message: string }>,
  maxIssues: number
): boolean {
  for (const issue of zodIssues) {
    if (issues.length >= maxIssues) return true;
    // Truncate each path segment first so a huge unrecognized key never
    // allocates a multi-hundred-KB joined path before the final cap.
    const suffix = issue.path
      .map((segment) => truncateIssueText(String(segment)))
      .join(".");
    const path = suffix ? `${pathPrefix}.${suffix}` : pathPrefix;
    issues.push(formatIssue(path, issue.message));
  }
  return issues.length >= maxIssues;
}

type ShellEnvelope = z.infer<typeof exportEnvelopeShellSchema>;

type RecordSchema =
  | typeof exportItemSchema
  | typeof exportTagSchema
  | typeof exportItemTagSchema
  | typeof exportLinkSchema
  | typeof exportJournalPeriodSchema;

function parseRecordCollection<T>(
  records: unknown[],
  schema: RecordSchema,
  pathLabel: string,
  issues: string[],
  maxIssues: number,
  abortOnFirstIssue: boolean
): T[] {
  const out: T[] = [];
  for (const [index, raw] of records.entries()) {
    if (issues.length >= maxIssues) break;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      pushZodIssues(
        issues,
        `${pathLabel}[${index}]`,
        parsed.error.issues,
        maxIssues
      );
      if (abortOnFirstIssue || issues.length >= maxIssues) break;
      continue;
    }
    out.push(parsed.data as T);
  }
  return out;
}

/**
 * Incrementally validate envelope records with a hard issue budget.
 * Never runs the fully typed `exportEnvelopeSchema` over large arrays — that
 * path can allocate hundreds of thousands of Zod issues for empty objects.
 */
export function parseTypedEnvelope(
  shell: ShellEnvelope,
  options?: { maxIssues?: number; abortOnFirstIssue?: boolean }
): { ok: true; data: ShadowbrainExportV1 } | { ok: false; issues: string[] } {
  const maxIssues = options?.maxIssues ?? IMPORT_MAX_ISSUES;
  const abortOnFirstIssue = options?.abortOnFirstIssue ?? false;
  const issues: string[] = [];

  const items = parseRecordCollection<ShadowbrainExportV1["items"][number]>(
    shell.items,
    exportItemSchema,
    "items",
    issues,
    maxIssues,
    abortOnFirstIssue
  );
  if (abortOnFirstIssue && issues.length > 0) return { ok: false, issues };

  const tags = parseRecordCollection<ShadowbrainExportV1["tags"][number]>(
    shell.tags,
    exportTagSchema,
    "tags",
    issues,
    maxIssues,
    abortOnFirstIssue
  );
  if (abortOnFirstIssue && issues.length > 0) return { ok: false, issues };

  const itemTags = parseRecordCollection<
    ShadowbrainExportV1["item_tags"][number]
  >(
    shell.item_tags,
    exportItemTagSchema,
    "item_tags",
    issues,
    maxIssues,
    abortOnFirstIssue
  );
  if (abortOnFirstIssue && issues.length > 0) return { ok: false, issues };

  const links = parseRecordCollection<ShadowbrainExportV1["links"][number]>(
    shell.links,
    exportLinkSchema,
    "links",
    issues,
    maxIssues,
    abortOnFirstIssue
  );
  if (abortOnFirstIssue && issues.length > 0) return { ok: false, issues };

  const journalPeriods = parseRecordCollection<
    ShadowbrainExportV1["journal_periods"][number]
  >(
    shell.journal_periods,
    exportJournalPeriodSchema,
    "journal_periods",
    issues,
    maxIssues,
    abortOnFirstIssue
  );

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    data: {
      format: shell.format,
      version: shell.version,
      exported_at: shell.exported_at,
      items,
      tags,
      item_tags: itemTags,
      links,
      journal_periods: journalPeriods,
    },
  };
}

/**
 * Fast schema gate for export importability: abort on the first invalid
 * record so large self-produced dumps never pay full Zod issue amplification.
 */
export function isExportEnvelopeSchemaValid(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }
  if (findUnknownEnvelopeKey(raw)) return false;

  const shell = exportEnvelopeShellSchema.safeParse(raw);
  if (!shell.success) return false;

  const typed = parseTypedEnvelope(shell.data, {
    maxIssues: 1,
    abortOnFirstIssue: true,
  });
  return typed.ok;
}
