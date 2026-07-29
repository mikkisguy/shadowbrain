"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, staleTimes } from "@/lib/query-config";

import type { GridRow } from "./types";

type GridRowType = "event" | "task";

const GRID_TYPES = new Set<GridRowType>(["event", "task"]);

interface RelatedItemPayload {
  id: string;
  type: string;
  title: string | null;
  status: string | null;
  dates: {
    start_date: string | null;
    end_date: string | null;
    due_date: string | null;
  };
  tags: string[];
  parent: { id: string; title: string | null; type: string } | null;
  updated_at: string;
}

interface RelatedResponse {
  items: RelatedItemPayload[];
}

interface ListItemPayload {
  id: string;
  type: string;
  title: string | null;
  metadata: string | null;
  tags: string[];
  updated_at: string;
}

interface ListResponse {
  items: ListItemPayload[];
}

function isGridType(type: string): type is GridRowType {
  return GRID_TYPES.has(type as GridRowType);
}

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function metadataFromRelated(
  item: RelatedItemPayload
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (item.status) meta.status = item.status;
  if (item.dates.start_date) meta.start_date = item.dates.start_date;
  if (item.dates.end_date) meta.end_date = item.dates.end_date;
  if (item.dates.due_date) meta.due_date = item.dates.due_date;
  return meta;
}

function startOrDueForType(
  type: GridRowType,
  startDate: string | null,
  dueDate: string | null
): string | null {
  if (type === "task") return dueDate ?? startDate;
  return startDate;
}

export function mapRelatedItemToGridRow(
  item: RelatedItemPayload
): GridRow | null {
  if (!isGridType(item.type)) return null;

  const startDate = item.dates.start_date;
  const dueDate = item.dates.due_date;

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    status: item.status,
    startOrDue: startOrDueForType(item.type, startDate, dueDate),
    end: item.dates.end_date,
    parent: item.parent,
    tags: item.tags,
    updatedAt: item.updated_at,
    metadata: metadataFromRelated(item),
  };
}

export function mapRelatedItemsToGridRows(
  items: RelatedItemPayload[]
): GridRow[] {
  return items
    .map(mapRelatedItemToGridRow)
    .filter((row): row is GridRow => row != null);
}

export function mapListItemToGridRow(item: ListItemPayload): GridRow | null {
  if (!isGridType(item.type)) return null;

  const metadata = parseMetadata(item.metadata);
  const status = typeof metadata.status === "string" ? metadata.status : null;
  const startDate =
    typeof metadata.start_date === "string" ? metadata.start_date : null;
  const dueDate =
    typeof metadata.due_date === "string" ? metadata.due_date : null;
  const endDate =
    typeof metadata.end_date === "string" ? metadata.end_date : null;

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    status,
    startOrDue: startOrDueForType(item.type, startDate, dueDate),
    end: endDate,
    parent: null,
    tags: item.tags,
    updatedAt: item.updated_at,
    metadata,
  };
}

export function mapListItemsToGridRows(items: ListItemPayload[]): GridRow[] {
  return items
    .map(mapListItemToGridRow)
    .filter((row): row is GridRow => row != null);
}

async function fetchProjectGridRows(
  projectId: string,
  signal?: AbortSignal
): Promise<GridRow[]> {
  const res = await fetch(`/api/items/${projectId}/related`, {
    credentials: "same-origin",
    signal,
  });
  if (!res.ok) {
    throw new Error("Failed to load project grid");
  }
  const json = (await res.json()) as RelatedResponse;
  return mapRelatedItemsToGridRows(json.items);
}

async function fetchGlobalGridRows(signal?: AbortSignal): Promise<GridRow[]> {
  const [eventsRes, tasksRes] = await Promise.all([
    fetch("/api/items?type=event&limit=100", {
      credentials: "same-origin",
      signal,
    }),
    fetch("/api/items?type=task&limit=100", {
      credentials: "same-origin",
      signal,
    }),
  ]);

  if (!eventsRes.ok || !tasksRes.ok) {
    throw new Error("Failed to load grid items");
  }

  const [eventsJson, tasksJson] = (await Promise.all([
    eventsRes.json(),
    tasksRes.json(),
  ])) as [ListResponse, ListResponse];

  return mapListItemsToGridRows([...eventsJson.items, ...tasksJson.items]);
}

export function useViewsGridData(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.views.grid(projectId),
    queryFn: ({ signal }) =>
      projectId
        ? fetchProjectGridRows(projectId, signal)
        : fetchGlobalGridRows(signal),
    staleTime: staleTimes.views,
  });
}
