"use client";

import { useMemo, useState, type SyntheticEvent } from "react";

import { WorkflowStatusStrip } from "@/components/workflow-status-strip";
import { Input } from "@/components/ui/input";
import { formatAbsolute } from "@/lib/dates";
import { cn } from "@/lib/utils";

import type { GridRow } from "./types";
import { useViewsGridData } from "./use-views-grid-data";
import {
  mergeGridMetadata,
  useViewsGridMutation,
} from "./use-views-grid-mutation";
import {
  ViewsGridEmpty,
  ViewsGridError,
  ViewsGridLoading,
} from "./views-states";

type GridSortKey = "title" | "scheduleDate" | "endDate" | "updatedAt";

type GridSortDirection = "asc" | "desc";

export interface ViewsGridProps {
  projectId: string | null;
  onRowOpen: (id: string) => void;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function compareStrings(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function compareDates(a: string | null, b: string | null): number {
  const aMs = a ? Date.parse(a) : Number.NaN;
  const bMs = b ? Date.parse(b) : Number.NaN;
  const aValid = !Number.isNaN(aMs);
  const bValid = !Number.isNaN(bMs);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  return aMs - bMs;
}

export function sortGridRows(
  rows: GridRow[],
  sortKey: GridSortKey,
  direction: GridSortDirection
): GridRow[] {
  const sorted = [...rows].sort((a, b) => {
    let result = 0;
    switch (sortKey) {
      case "title":
        result = compareStrings(a.title, b.title);
        break;
      case "scheduleDate":
        result = compareDates(a.startOrDue, b.startOrDue);
        break;
      case "endDate":
        result = compareDates(a.end, b.end);
        break;
      case "updatedAt":
        result = compareDates(a.updatedAt, b.updatedAt);
        break;
      default:
        result = 0;
    }
    return direction === "asc" ? result : -result;
  });
  return sorted;
}

function stopRowOpen(event: SyntheticEvent) {
  event.stopPropagation();
}

interface SortableHeaderProps {
  label: string;
  sortKey: GridSortKey;
  activeKey: GridSortKey;
  direction: GridSortDirection;
  onSort: (key: GridSortKey) => void;
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: SortableHeaderProps) {
  const active = activeKey === sortKey;
  const indicator = active ? (direction === "asc" ? " ↑" : " ↓") : "";

  return (
    <th scope="col" className="px-3 py-2 text-left font-medium">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
        onClick={() => onSort(sortKey)}
        data-testid={`sort-${sortKey}`}
      >
        {label}
        {indicator}
      </button>
    </th>
  );
}

export function ViewsGrid({ projectId, onRowOpen }: ViewsGridProps) {
  const { data, isPending, isError, error, refetch } =
    useViewsGridData(projectId);
  const mutation = useViewsGridMutation();
  const [sortKey, setSortKey] = useState<GridSortKey>("title");
  const [sortDirection, setSortDirection] = useState<GridSortDirection>("asc");

  const rows = useMemo(
    () => sortGridRows(data ?? [], sortKey, sortDirection),
    [data, sortKey, sortDirection]
  );

  function handleSort(nextKey: GridSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function patchRow(row: GridRow, changes: Record<string, unknown>) {
    mutation.mutate({
      id: row.id,
      type: row.type as "event" | "task",
      metadata: mergeGridMetadata(row.metadata, changes),
    });
  }

  if (isPending) {
    return <ViewsGridLoading />;
  }

  if (isError) {
    return (
      <ViewsGridError
        error={error instanceof Error ? error.message : null}
        onRetry={() => void refetch()}
      />
    );
  }

  if (rows.length === 0) {
    return <ViewsGridEmpty scoped={projectId != null} />;
  }

  return (
    <div
      data-testid="views-grid"
      className="border-border overflow-x-auto rounded-sm border"
    >
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead className="bg-surface-muted/60 border-border border-b">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium">
              Type
            </th>
            <SortableHeader
              label="Title"
              sortKey="title"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={handleSort}
            />
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium">
              Status
            </th>
            <SortableHeader
              label="Start/Due"
              sortKey="scheduleDate"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              label="End"
              sortKey="endDate"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={handleSort}
            />
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium">
              Parent
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium">
              Tags
            </th>
            <SortableHeader
              label="Updated"
              sortKey="updatedAt"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid={`views-grid-row-${row.id}`}
              className="border-border hover:bg-surface-muted/40 border-b last:border-b-0"
              onClick={() => onRowOpen(row.id)}
            >
              <td className="text-muted-foreground px-3 py-2 capitalize">
                {row.type}
              </td>
              <td className="px-3 py-2 font-medium">
                {row.title ?? "Untitled"}
              </td>
              <td
                className="px-3 py-2"
                onClick={stopRowOpen}
                onKeyDown={stopRowOpen}
              >
                <WorkflowStatusStrip
                  value={row.status ?? "todo"}
                  onChange={(status) => patchRow(row, { status })}
                  disabled={mutation.isPending}
                />
              </td>
              <td
                className="px-3 py-2"
                onClick={stopRowOpen}
                onKeyDown={stopRowOpen}
              >
                <Input
                  type="datetime-local"
                  className="h-7 min-w-[11rem] text-xs"
                  value={toDatetimeLocalValue(row.startOrDue)}
                  onChange={(event) => {
                    const iso = fromDatetimeLocalValue(event.target.value);
                    patchRow(
                      row,
                      row.type === "task"
                        ? { due_date: iso }
                        : { start_date: iso }
                    );
                  }}
                  onPointerDown={stopRowOpen}
                  data-testid={`grid-start-due-${row.id}`}
                />
              </td>
              <td
                className="px-3 py-2"
                onClick={stopRowOpen}
                onKeyDown={stopRowOpen}
              >
                <Input
                  type="datetime-local"
                  className="h-7 min-w-[11rem] text-xs"
                  value={toDatetimeLocalValue(row.end)}
                  onChange={(event) => {
                    const iso = fromDatetimeLocalValue(event.target.value);
                    patchRow(row, { end_date: iso });
                  }}
                  onPointerDown={stopRowOpen}
                  data-testid={`grid-end-${row.id}`}
                />
              </td>
              <td className="text-muted-foreground px-3 py-2">
                {row.parent?.title ?? "—"}
              </td>
              <td className="text-muted-foreground px-3 py-2">
                {row.tags.length > 0 ? row.tags.join(", ") : "—"}
              </td>
              <td
                className={cn(
                  "text-muted-foreground px-3 py-2 text-xs",
                  row.updatedAt ? "" : "italic"
                )}
                title={
                  row.updatedAt ? formatAbsolute(row.updatedAt) : undefined
                }
              >
                {row.updatedAt ? formatAbsolute(row.updatedAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
