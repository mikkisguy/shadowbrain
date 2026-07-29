"use client";

import { CelestialHeader } from "@/components/visual/celestial-motif";
import { ItemPreviewSheet } from "@/app/browse/item-preview-sheet";

import { ProjectPicker } from "./project-picker";
import { useViewsState } from "./use-views-state";
import { ViewsGrid } from "./views-grid";
import { ViewsKanban } from "./views-kanban";
import { ViewsTabs } from "./views-tabs";

function TimelinePlaceholder() {
  return (
    <section
      data-testid="views-timeline-placeholder"
      className="border-border bg-surface-elevated flex max-w-2xl flex-col gap-3 rounded-sm border p-6"
    >
      <p className="text-accent-cyan font-sans text-xs font-medium tracking-[0.12em] uppercase">
        Timeline
      </p>
      <h2 className="text-foreground font-sans text-lg font-medium">
        Coming soon
      </h2>
      <p className="text-muted-foreground font-sans text-sm">
        Timeline view will chart events and tasks over time. Routing and URL
        sync are wired; the visual ships in a follow-up.
      </p>
    </section>
  );
}

export function ViewsPage() {
  const {
    view,
    projectId,
    itemId,
    setView,
    setProjectId,
    setItemId,
    clearItem,
  } = useViewsState();

  return (
    <main
      id="main-content"
      data-testid="views-page"
      className="mx-auto flex w-full max-w-screen-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="relative flex flex-col gap-3 overflow-hidden pb-2">
        <CelestialHeader headerShift={-15} />
        <p className="text-muted-foreground relative z-10 font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          Events & tasks
        </p>
        <h1 className="text-foreground relative z-10 font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          Views
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <ViewsTabs active={view} onChange={setView} />
          <ProjectPicker projectId={projectId} onProjectChange={setProjectId} />
        </div>

        {view === "grid" && (
          <ViewsGrid projectId={projectId} onRowOpen={setItemId} />
        )}
        {view === "timeline" && <TimelinePlaceholder />}
        {view === "kanban" && (
          <ViewsKanban projectId={projectId} onCardOpen={setItemId} />
        )}
      </div>

      <ItemPreviewSheet itemId={itemId} onClose={clearItem} />
    </main>
  );
}
