"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useRef, useState, type MutableRefObject } from "react";

import { ContentTypeLabel } from "@/components/content-type-label";
import { Button } from "@/components/ui/button";
import {
  parseWorkflowStatus,
  WORKFLOW_STATUS_OPTIONS,
  type WorkflowStatusValue,
} from "@/lib/workflow-status";
import { cn } from "@/lib/utils";

import type { GridRow } from "./types";
import { useViewsGridData } from "./use-views-grid-data";
import { useViewsKanbanMutation } from "./use-views-kanban-mutation";
import {
  ViewsGridEmpty,
  ViewsGridError,
  ViewsGridLoading,
} from "./views-states";

const DONE_COLLAPSE_COUNT = 8;
const compactDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export interface ViewsKanbanProps {
  projectId: string | null;
  onCardOpen: (id: string) => void;
}

export function groupRowsByStatus(
  rows: GridRow[]
): Record<WorkflowStatusValue, GridRow[]> {
  const groups: Record<WorkflowStatusValue, GridRow[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };

  for (const row of rows) {
    groups[parseWorkflowStatus(JSON.stringify(row.metadata))].push(row);
  }

  return groups;
}

function formatKeyDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : compactDateFormatter.format(date);
}

function KanbanCard({
  row,
  onOpen,
  suppressOpenRef,
}: {
  row: GridRow;
  onOpen: (id: string) => void;
  suppressOpenRef: MutableRefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: row.id,
      data: { row },
    });
  const keyDate = row.startOrDue ? formatKeyDate(row.startOrDue) : null;

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`kanban-card-${row.id}`}
      className={cn(
        "border-border bg-surface-elevated hover:border-foreground/30 cursor-grab rounded-sm border p-3 shadow-sm transition-colors active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => {
        if (!suppressOpenRef.current) onOpen(row.id);
      }}
    >
      <div className="text-muted-foreground flex items-center gap-2 font-mono text-[0.65rem] font-medium tracking-[0.12em] uppercase">
        <ContentTypeLabel type={row.type} />
      </div>
      <p className="text-foreground mt-2 line-clamp-2 font-sans text-sm leading-snug font-medium break-words">
        {row.title?.trim() || "Untitled"}
      </p>
      {(row.parent || keyDate) && (
        <div className="text-muted-foreground mt-3 flex min-w-0 items-center gap-2 font-sans text-xs">
          {row.parent && (
            <span
              className="min-w-0 truncate"
              title={row.parent.title ?? undefined}
            >
              {row.parent.title?.trim() || "Untitled parent"}
            </span>
          )}
          {row.parent && keyDate && <span aria-hidden>·</span>}
          {keyDate && (
            <time dateTime={row.startOrDue ?? undefined}>{keyDate}</time>
          )}
        </div>
      )}
    </article>
  );
}

function KanbanColumn({
  status,
  label,
  rows,
  onCardOpen,
  suppressOpenRef,
  doneExpanded,
  onDoneToggle,
}: {
  status: WorkflowStatusValue;
  label: string;
  rows: GridRow[];
  onCardOpen: (id: string) => void;
  suppressOpenRef: MutableRefObject<boolean>;
  doneExpanded: boolean;
  onDoneToggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const isCollapsibleDone =
    status === "done" && rows.length > DONE_COLLAPSE_COUNT;
  const visibleRows =
    isCollapsibleDone && !doneExpanded
      ? rows.slice(0, DONE_COLLAPSE_COUNT)
      : rows;

  return (
    <section
      data-testid={`kanban-column-${status}`}
      className="bg-surface-muted/35 border-border flex min-h-64 min-w-64 flex-1 flex-col rounded-sm border"
    >
      <header className="border-border flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-foreground font-sans text-sm font-medium">
          {label}
        </h2>
        <span
          data-testid={`kanban-column-count-${status}`}
          className="text-muted-foreground font-mono text-xs"
        >
          {rows.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-48 flex-1 flex-col gap-2 p-2 transition-colors",
          isOver && "bg-accent-cyan/10"
        )}
      >
        {visibleRows.map((row) => (
          <KanbanCard
            key={row.id}
            row={row}
            onOpen={onCardOpen}
            suppressOpenRef={suppressOpenRef}
          />
        ))}
      </div>
      {isCollapsibleDone && (
        <div className="border-border border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="kanban-done-toggle"
            aria-expanded={doneExpanded}
            className="w-full"
            onClick={onDoneToggle}
          >
            {doneExpanded
              ? "Show fewer"
              : `Show ${rows.length - DONE_COLLAPSE_COUNT} more`}
          </Button>
        </div>
      )}
    </section>
  );
}

export function ViewsKanban({ projectId, onCardOpen }: ViewsKanbanProps) {
  const { data, isPending, isError, error, refetch } =
    useViewsGridData(projectId);
  const { moveCard } = useViewsKanbanMutation(projectId);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const suppressOpenRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const rows = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => groupRowsByStatus(rows), [rows]);

  function resolveDropStatus(overId: string): WorkflowStatusValue | null {
    if (WORKFLOW_STATUS_OPTIONS.some((option) => option.value === overId)) {
      return overId as WorkflowStatusValue;
    }
    const overRow = rows.find((candidate) => candidate.id === overId);
    if (!overRow) return null;
    return parseWorkflowStatus(JSON.stringify(overRow.metadata));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    suppressOpenRef.current = true;
    window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 0);

    const row = active.data.current?.row as GridRow | undefined;
    if (!row || over == null || (row.type !== "event" && row.type !== "task")) {
      return;
    }

    const toStatus = resolveDropStatus(String(over.id));
    if (!toStatus) return;

    moveCard({
      id: row.id,
      type: row.type,
      fromStatus: parseWorkflowStatus(JSON.stringify(row.metadata)),
      toStatus,
      metadata: row.metadata,
    });
  }

  if (isPending) return <ViewsGridLoading />;
  if (isError) {
    return (
      <ViewsGridError
        error={error instanceof Error ? error.message : null}
        onRetry={() => void refetch()}
      />
    );
  }
  if (rows.length === 0) return <ViewsGridEmpty scoped={projectId != null} />;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div data-testid="views-kanban" className="grid gap-4 lg:grid-cols-3">
        {WORKFLOW_STATUS_OPTIONS.map(({ value, label }) => (
          <KanbanColumn
            key={value}
            status={value}
            label={label}
            rows={groups[value]}
            onCardOpen={onCardOpen}
            suppressOpenRef={suppressOpenRef}
            doneExpanded={doneExpanded}
            onDoneToggle={() => setDoneExpanded((expanded) => !expanded)}
          />
        ))}
      </div>
    </DndContext>
  );
}
