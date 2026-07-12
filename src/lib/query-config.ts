/**
 * Centralized query keys for TanStack Query.
 *
 * All query keys should be defined here to avoid magic strings scattered
 * throughout the codebase. This makes it easy to:
 * - Find all queries that touch a specific domain
 * - Invalidate related queries (e.g., invalidate all browse queries)
 * - Refactor query shapes without breaking invalidation logic
 *
 * Pattern: each domain has an `all` key for broad invalidation and
 * factory functions for specific queries with parameters.
 */

import type { BrowseFilters } from "@/app/browse/types";

/**
 * Centralized staleTime values for TanStack Query.
 *
 * Each value represents how long data is considered fresh before
 * TanStack Query will refetch it on mount. Shorter times mean fresher
 * data but more requests; longer times mean fewer requests but
 * potentially stale data.
 *
 * - `browse`: 5s — main data view, stale is bad
 * - `settings`: Infinity — settings rarely change, user explicitly saves
 * - `systemInfo`: 60s — rarely changes
 * - `tags`: 30s — tags change occasionally, not constantly
 * - `search`: 60s — search results can be cached for repeated queries
 */
export const staleTimes = {
  browse: 5_000,
  settings: Infinity,
  systemInfo: 60_000,
  tags: 30_000,
  search: 60_000,
} as const;

export const queryKeys = {
  /**
   * Browse page queries.
   * - `all`: invalidates all browse queries regardless of filters
   * - `list`: specific browse query with filter parameters
   */
  browse: {
    all: ["browse"] as const,
    list: (filters: BrowseFilters) => ["browse", filters] as const,
  },

  /**
   * Settings queries.
   * - `all`: invalidates all settings queries
   * - `current`: the current settings snapshot
   * - `systemInfo`: system info (item count, DB size, last backup)
   */
  settings: {
    all: ["settings"] as const,
    current: ["settings", "current"] as const,
    systemInfo: ["settings", "systemInfo"] as const,
  },

  /**
   * Tags queries.
   * - `all`: invalidates all tags queries
   * - `list`: the full tag list with counts (TagWithCount[])
   * - `typeahead`: tag names only for the browse filter typeahead ({ name }[])
   */
  tags: {
    all: ["tags"] as const,
    list: ["tags", "list"] as const,
    typeahead: ["tags", "typeahead"] as const,
  },

  /**
   * Search queries (command palette, etc).
   * - `all`: invalidates all search queries
   * - `results`: search results for a specific query
   */
  search: {
    all: ["search"] as const,
    results: (query: string) => ["search", "results", query] as const,
  },

  /**
   * API token queries.
   * - `all`: invalidates all API token queries
   * - `list`: the full list of admin API tokens
   */
  apiTokens: {
    all: ["api-tokens"] as const,
    list: ["api-tokens", "list"] as const,
  },
} as const;
