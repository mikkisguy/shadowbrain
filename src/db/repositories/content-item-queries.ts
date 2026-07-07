import { splitTags } from "@/lib/tags";
import type { VisibilityOptions } from "./content-items";

/**
 * Build the visibility WHERE clauses and params for content_items queries.
 * Uses `ci.` table alias when `alias` is provided (for JOIN contexts), or
 * no alias for simple queries.
 */
export function buildVisibilityClauses(
  options: VisibilityOptions,
  alias?: string
): { clauses: string[]; params: (string | number)[] } {
  const includeHidden = options.includeHidden ?? false;
  const includePrivate = options.includePrivate ?? false;
  const prefix = alias ? `${alias}.` : "";
  return {
    clauses: [
      `(${prefix}is_hidden = 0 OR ?)`,
      `(${prefix}is_private = 0 OR ?)`,
    ],
    params: [includeHidden ? 1 : 0, includePrivate ? 1 : 0],
  };
}

export interface ListFiltersOptions {
  type?: string;
  tag?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Build the full WHERE clause for listWithFilters.
 * Combines visibility clauses with type, source, date-range, and tag filters.
 */
export function buildListWhereClause(
  options: ListFiltersOptions & VisibilityOptions
): { whereSql: string; params: (string | number)[] } {
  const vis = buildVisibilityClauses(options, "ci");
  const where: string[] = [...vis.clauses];
  const params: (string | number)[] = [...vis.params];

  if (options.type) {
    where.push("ci.type = ?");
    params.push(options.type);
  }
  if (options.source) {
    where.push("ci.source = ?");
    params.push(options.source);
  }
  if (options.startDate) {
    where.push("ci.created_at >= ?");
    params.push(options.startDate);
  }
  if (options.endDate) {
    where.push("ci.created_at <= ?");
    params.push(options.endDate);
  }
  if (options.tag) {
    const tagNames = splitTags(options.tag);
    if (tagNames.length > 0) {
      const placeholders = tagNames.map(() => "?").join(",");
      where.push(
        `EXISTS (SELECT 1 FROM content_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.content_id = ci.id AND t.name IN (${placeholders}))`
      );
      params.push(...tagNames);
    }
  }

  return { whereSql: `WHERE ${where.join(" AND ")}`, params };
}
