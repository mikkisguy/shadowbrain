import type { ContentItem } from "@/db/repositories/content-items";

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed metadata on export.
  }
  return {};
}

export function contentItemToMarkdown(item: ContentItem): string {
  const metadata = parseMetadata(item.metadata);
  const frontmatter: Record<string, unknown> = {
    id: item.id,
    type: item.type,
    source: item.source,
    created_at: item.created_at,
    updated_at: item.updated_at,
    ...metadata,
  };

  if (item.title) frontmatter.title = item.title;
  if (item.source_url) frontmatter.source_url = item.source_url;
  if (item.is_private) frontmatter.is_private = item.is_private;
  if (item.is_hidden) frontmatter.is_hidden = item.is_hidden;

  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "", item.content);
  return lines.join("\n");
}

export function exportItemsAsMarkdown(items: ContentItem[]): string {
  return items.map((item) => contentItemToMarkdown(item)).join("\n\n---\n\n");
}

export function exportItemsAsJson(items: ContentItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      ...item,
      metadata: parseMetadata(item.metadata),
    })),
    null,
    2
  );
}
