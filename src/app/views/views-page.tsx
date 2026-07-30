"use client";

import { CelestialHeader } from "@/components/visual/celestial-motif";
import { ItemPreviewSheet } from "@/app/browse/item-preview-sheet";

import { ProjectPicker } from "./project-picker";
import { useViewsState } from "./use-views-state";
import { ViewsGrid } from "./views-grid";
import { ViewsKanban } from "./views-kanban";
import { ViewsTabs } from "./views-tabs";
import { ViewsTimeline } from "./views-timeline";

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
        {view === "timeline" && (
          <ViewsTimeline projectId={projectId} onItemOpen={setItemId} />
        )}
        {view === "kanban" && (
          <ViewsKanban projectId={projectId} onCardOpen={setItemId} />
        )}
      </div>

      <ItemPreviewSheet itemId={itemId} onClose={clearItem} />
    </main>
  );
}
