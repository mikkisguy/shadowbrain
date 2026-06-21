/**
 * Browser-side API client for the Browse page.
 *
 * Wraps `fetch` with:
 *   - The same `credentials: "same-origin"` policy the rest of the
 *     app uses (the session cookie is HttpOnly; the browser sends
 *     it automatically).
 *   - Endpoint selection: `/api/search` when `q` is set, `/api/items`
 *     otherwise. Both endpoints accept `type` and `tag`; the items
 *     endpoint additionally accepts `source` / `startDate` / `endDate`.
 *   - Response normalisation: `/api/search` returns `{ results, … }`
 *     and `/api/items` returns `{ items, … }`; the Browse feed
 *     expects `items`, so we re-map the search payload before
 *     returning.
 *
 * Errors are surfaced as thrown `BrowseApiError` so the React side
 * can show a single error card and a "Retry" affordance rather than
 * branching on every fetch site.
 */

import type { BrowseFilters, BrowseItem, BrowseResponse } from "./types";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class BrowseApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BrowseApiError";
    this.status = status;
  }
}

export interface FetchBrowseItemsOptions {
  /** Page (1-based) — defaults to 1. */
  page?: number;
  /** Page size — defaults to 20. The endpoint caps at 100. */
  limit?: number;
  /** Abort signal for the request — wired to the search debounce. */
  signal?: AbortSignal;
}

/** Build the `URLSearchParams` for a request. Empty / undefined
 *  values are dropped so the URL stays clean. */
function buildParams(
  filters: BrowseFilters,
  page: number,
  limit: number
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.source) params.set("source", filters.source);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return params;
}

/** Pick the endpoint + build the URL. `/api/search` requires `q`;
 *  `/api/items` is the un-searched list endpoint. */
function endpointFor(filters: BrowseFilters): {
  url: string;
  mapResults: (body: Record<string, unknown>) => BrowseItem[];
} {
  if (filters.q && filters.q.trim()) {
    return {
      url: "/api/search",
      // The search endpoint returns `results` (with a `rank` and a
      // FTS5 `snippet`); we strip those to the canonical BrowseItem
      // shape so the feed component never has to branch.
      mapResults: (body) =>
        Array.isArray(body.results)
          ? (body.results as BrowseItem[]).map(stripSearchOnly)
          : [],
    };
  }
  return {
    url: "/api/items",
    mapResults: (body) =>
      Array.isArray(body.items) ? (body.items as BrowseItem[]) : [],
  };
}

/** The search endpoint carries a `rank` and a `snippet` per row;
 *  the items endpoint does not. Both are valid for the Browse feed,
 *  but the type only declares the shared columns. Strip the extra
 *  fields so the response matches `BrowseItem` exactly. */
function stripSearchOnly<T extends BrowseItem>(row: T): BrowseItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    source: row.source,
    source_url: row.source_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchBrowseItems(
  filters: BrowseFilters,
  options: FetchBrowseItemsOptions = {}
): Promise<BrowseResponse> {
  const page = options.page ?? DEFAULT_PAGE;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const { url, mapResults } = endpointFor(filters);
  const target = `${url}?${buildParams(filters, page, limit).toString()}`;

  const response = await fetch(target, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });

  if (!response.ok) {
    // The App Security Baseline says API failures stay generic; we
    // log the status server-side (well, we can't, so we just carry
    // it in the error) and let the UI render a one-line retry card.
    throw new BrowseApiError(
      response.status,
      `Request failed with status ${response.status}`
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  const items = mapResults(body);
  const total = typeof body.total === "number" ? body.total : items.length;
  const returnedPage = typeof body.page === "number" ? body.page : page;
  const returnedLimit = typeof body.limit === "number" ? body.limit : limit;
  return { items, total, page: returnedPage, limit: returnedLimit };
}
