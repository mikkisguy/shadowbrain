"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  defaultKeyboardCoordinateGetter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useMemo, useState } from "react";

import { ContentTypeLabel } from "@/components/content-type-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  includeHidden?: boolean;
  includePrivate?: boolean;
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

export function matchesKanbanQuery(row: GridRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [row.title, row.parent?.title, row.type, ...row.tags].some(
    (value) => value != null && value.toLowerCase().includes(normalizedQuery)
  );
}

export function filterKanbanRows(rows: GridRow[], query: string): GridRow[] {
  return rows.filter((row) => matchesKanbanQuery(row, query));
}

function formatKeyDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : compactDateFormatter.format(date);
}

export type KanbanMovePlan = {
  id: string;
  type: "event" | "task";
  fromStatus: WorkflowStatusValue;
  toStatus: WorkflowStatusValue;
  metadata: GridRow["metadata"];
};

export function planKanbanMove({
  activeId,
  overId,
  rows,
}: {
  activeId: string;
  overId?: string | null;
  rows: GridRow[];
}): KanbanMovePlan | null {
  if (overId == null) return null;

  const row = rows.find((candidate) => candidate.id === activeId);
  if (!row || (row.type !== "event" && row.type !== "task")) return null;

  const toStatus = WORKFLOW_STATUS_OPTIONS.some(
    (option) => option.value === overId
  )
    ? (overId as WorkflowStatusValue)
    : null;
  if (!toStatus) return null;

  const fromStatus = parseWorkflowStatus(JSON.stringify(row.metadata));
  if (fromStatus === toStatus) return null;

  return {
    id: row.id,
    type: row.type,
    fromStatus,
    toStatus,
    metadata: row.metadata,
  };
}

export function executeKanbanMove({
  activeId,
  overId,
  rows,
  moveCard,
}: {
  activeId: string;
  overId?: string | null;
  rows: GridRow[];
  moveCard: (plan: KanbanMovePlan) => void;
}) {
  const plan = planKanbanMove({ activeId, overId, rows });
  if (plan) moveCard(plan);
}

function createKanbanAnnouncements(rows: GridRow[]): Announcements {
  const getRow = (activeId: string) => rows.find((row) => row.id === activeId);
  const getTitle = (row: GridRow | undefined) =>
    row?.title?.trim() || "Untitled";
  const getStatusLabel = (status: WorkflowStatusValue) =>
    WORKFLOW_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status;
  const getOverLabel = (over: { id: string | number } | null) => {
    if (!over) return null;
    return WORKFLOW_STATUS_OPTIONS.find(
      (option) => option.value === String(over.id)
    )?.label;
  };

  return {
    onDragStart({ active }) {
      const row = getRow(String(active.id));
      if (!row) return;
      const status = parseWorkflowStatus(JSON.stringify(row.metadata));
      return `Picked up ${getTitle(row)} in ${getStatusLabel(status)}.`;
    },
    onDragOver({ active, over }) {
      const row = getRow(String(active.id));
      const status = getOverLabel(over);
      if (!row || !status) return;
      return `${getTitle(row)} over ${status}.`;
    },
    onDragEnd({ active, over }) {
      const row = getRow(String(active.id));
      const status = getOverLabel(over);
      if (!row) return;
      return status
        ? `Dropped ${getTitle(row)} in ${status}.`
        : `Dropped ${getTitle(row)}.`;
    },
    onDragCancel({ active }) {
      const row = getRow(String(active.id));
      return row ? `Cancelled dragging ${getTitle(row)}.` : undefined;
    },
  };
}

function createKanbanKeyboardCoordinateGetter(
  rows: GridRow[]
): KeyboardCoordinateGetter {
  return (event, { active, currentCoordinates, context }) => {
    const isLeft = event.code === "ArrowLeft" || event.key === "ArrowLeft";
    const isRight = event.code === "ArrowRight" || event.key === "ArrowRight";
    if (!isLeft && !isRight) {
      return defaultKeyboardCoordinateGetter(event, {
        active,
        currentCoordinates,
        context,
      });
    }

    const row = rows.find((candidate) => candidate.id === String(active));
    if (!row) return currentCoordinates;
    const overStatus =
      context.over &&
      WORKFLOW_STATUS_OPTIONS.some(
        (option) => option.value === context.over?.id
      )
        ? (context.over.id as WorkflowStatusValue)
        : null;
    const currentStatus =
      overStatus ?? parseWorkflowStatus(JSON.stringify(row.metadata));
    const currentIndex = WORKFLOW_STATUS_OPTIONS.findIndex(
      (option) => option.value === currentStatus
    );
    const direction = isRight ? 1 : -1;
    const target = WORKFLOW_STATUS_OPTIONS[currentIndex + direction];
    if (!target) return currentCoordinates;

    const rect = context.droppableRects.get(target.value);
    if (!rect) return currentCoordinates;

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };
}

function KanbanCard({
  row,
  onOpen,
}: {
  row: GridRow;
  onOpen: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: row.id,
    data: { row },
  });
  const keyDate = row.startOrDue ? formatKeyDate(row.startOrDue) : null;
  const title = row.title?.trim() || "Untitled";

  return (
    <article
      ref={setNodeRef}
      data-testid={`kanban-card-${row.id}`}
      className={cn(
        "border-border bg-surface-elevated hover:border-foreground/30 rounded-sm border p-3 shadow-sm transition-colors",
        isDragging && "opacity-40"
      )}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <div className="text-muted-foreground flex items-center justify-between gap-2 font-mono text-[0.65rem] font-medium tracking-[0.12em] uppercase">
        <ContentTypeLabel type={row.type} />
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Drag ${title}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring size-8 touch-none rounded-sm p-1 focus-visible:ring-2 focus-visible:outline-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" size={14} />
        </button>
      </div>
      <button
        type="button"
        className="text-foreground focus-visible:ring-ring mt-2 block w-full rounded-sm text-left font-sans text-sm leading-snug font-medium break-words focus-visible:ring-2 focus-visible:outline-none"
        aria-label={`Open ${title}`}
        onClick={() => onOpen(row.id)}
      >
        {title}
      </button>
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
  doneExpanded,
  onDoneToggle,
}: {
  status: WorkflowStatusValue;
  label: string;
  rows: GridRow[];
  onCardOpen: (id: string) => void;
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
          <KanbanCard key={row.id} row={row} onOpen={onCardOpen} />
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

export function ViewsKanban({
  projectId,
  onCardOpen,
  includeHidden = false,
  includePrivate = false,
}: ViewsKanbanProps) {
  const { data, isPending, isError, error, refetch } = useViewsGridData(
    projectId,
    { includeHidden, includePrivate }
  );
  const { moveCard } = useViewsKanbanMutation(projectId, {
    includeHidden,
    includePrivate,
  });
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => data ?? [], [data]);
  const filteredRows = useMemo(
    () => filterKanbanRows(rows, query),
    [rows, query]
  );
  const groups = useMemo(() => groupRowsByStatus(filteredRows), [filteredRows]);
  const keyboardCoordinateGetter = useMemo(
    () => createKanbanKeyboardCoordinateGetter(filteredRows),
    [filteredRows]
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinateGetter })
  );
  const announcements = useMemo(
    () => createKanbanAnnouncements(filteredRows),
    [filteredRows]
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    executeKanbanMove({
      activeId: String(active.id),
      overId: over == null ? null : String(over.id),
      rows: filteredRows,
      moveCard,
    });
  }

  if (isPending) return <ViewsGridLoading noun="Kanban board" />;
  if (isError) {
    return (
      <ViewsGridError
        error={error instanceof Error ? error.message : null}
        onRetry={() => void refetch()}
        noun="Kanban board"
      />
    );
  }
  if (rows.length === 0) {
    return <ViewsGridEmpty scoped={projectId != null} noun="Kanban board" />;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <div className="space-y-4">
        <div className="border-border flex items-center gap-2 rounded-sm border p-2">
          <label htmlFor="kanban-filter" className="sr-only">
            Filter cards
          </label>
          <Input
            id="kanban-filter"
            placeholder="Search cards…"
            aria-label="Filter cards"
            data-testid="kanban-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {filteredRows.length === 0 && (
          <div
            data-testid="kanban-no-matches"
            className="border-border bg-surface-muted/35 text-muted-foreground flex items-center justify-between gap-3 rounded-sm border px-3 py-2 text-sm"
          >
            <span>No cards match “{query.trim()}”.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="kanban-filter-clear"
              onClick={() => setQuery("")}
            >
              Clear filter
            </Button>
          </div>
        )}
        <div data-testid="views-kanban" className="grid gap-4 lg:grid-cols-3">
          {WORKFLOW_STATUS_OPTIONS.map(({ value, label }) => (
            <KanbanColumn
              key={value}
              status={value}
              label={label}
              rows={groups[value]}
              onCardOpen={onCardOpen}
              doneExpanded={doneExpanded}
              onDoneToggle={() => setDoneExpanded((expanded) => !expanded)}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}
