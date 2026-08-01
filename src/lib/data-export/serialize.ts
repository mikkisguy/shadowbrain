import type { ContentItem } from "@/db/repositories/content-items";
import type { ContentLink } from "@/db/repositories/content-links";
import type { JournalPeriod } from "@/db/repositories/journal-periods";
import type { ShadowbrainExportInput, ShadowbrainExportV1 } from "./types";

function parseMetadata(
  metadata: ContentItem["metadata"]
): Record<string, unknown> | null {
  if (metadata === null) return null;

  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Keep malformed metadata as an empty object, matching the existing exporter.
  }

  return {};
}

function dedupeLinks(links: ContentLink[]): ShadowbrainExportV1["links"] {
  const seen = new Set<string>();
  const deduped: ShadowbrainExportV1["links"] = [];
  const sortedLinks = [...links].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );

  for (const link of sortedLinks) {
    const endpoints = [link.source_id, link.target_id].sort();
    const key = `${endpoints.join("|")}|${link.link_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      id: link.id,
      source_id: link.source_id,
      target_id: link.target_id,
      link_type: link.link_type,
      context: link.context,
      created_at: link.created_at,
    });
  }

  return deduped;
}

export function buildExportEnvelope({
  items,
  tags,
  itemTags,
  links,
  journalPeriods,
  exportedAt,
}: ShadowbrainExportInput): ShadowbrainExportV1 {
  return {
    format: "shadowbrain-export",
    version: 1,
    exported_at: exportedAt ?? new Date().toISOString(),
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content,
      image_path: item.image_path,
      source: item.source,
      source_url: item.source_url,
      metadata: parseMetadata(item.metadata),
      is_private: item.is_private === 1 ? 1 : 0,
      is_hidden: item.is_hidden === 1 ? 1 : 0,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      created_at: tag.created_at,
    })),
    item_tags: itemTags.map((itemTag) => ({
      content_id: itemTag.content_id,
      tag_id: itemTag.tag_id,
      created_at: itemTag.created_at,
    })),
    links: dedupeLinks(links),
    journal_periods: journalPeriods.map((period: JournalPeriod) => ({
      content_id: period.content_id,
      period_start: period.period_start,
      period_end: period.period_end,
      raw_count: period.raw_count,
      model_used: period.model_used,
    })),
  };
}

export function exportAsJsonString(envelope: ShadowbrainExportV1): string {
  return JSON.stringify(envelope, null, 2);
}
