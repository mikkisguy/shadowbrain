"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ItemPreviewSheet } from "@/app/browse/item-preview-sheet";
import { ViewsGrid } from "@/app/views/views-grid";
import { ViewsKanban } from "@/app/views/views-kanban";
import { ViewsTabs } from "@/app/views/views-tabs";
import { ViewsTimeline } from "@/app/views/views-timeline";
import type { ViewsTab } from "@/app/views/types";

interface ProjectBoardSectionProps {
  projectId: string;
}

export function ProjectBoardSection({ projectId }: ProjectBoardSectionProps) {
  const [activeTab, setActiveTab] = useState<ViewsTab>("grid");
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="project-board-heading"
      className="flex flex-col gap-4"
      data-testid="project-board-section"
    >
      <h2
        id="project-board-heading"
        className="text-foreground font-serif text-2xl font-semibold"
      >
        Board
      </h2>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewsTabs active={activeTab} onChange={setActiveTab} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            render={
              <Link
                href={`/add?type=task&project=${projectId}`}
                data-testid="project-board-add-task"
              />
            }
            variant="outline"
            size="sm"
          >
            Add task
          </Button>
          <Button
            render={
              <Link
                href={`/add?type=event&project=${projectId}`}
                data-testid="project-board-add-event"
              />
            }
            variant="outline"
            size="sm"
          >
            Add event
          </Button>
        </div>
      </div>

      {activeTab === "grid" ? (
        <ViewsGrid
          projectId={projectId}
          onRowOpen={setPreviewItemId}
          includeHidden
          includePrivate
        />
      ) : activeTab === "timeline" ? (
        <ViewsTimeline
          projectId={projectId}
          onItemOpen={setPreviewItemId}
          includeHidden
          includePrivate
        />
      ) : (
        <ViewsKanban
          projectId={projectId}
          onCardOpen={setPreviewItemId}
          includeHidden
          includePrivate
        />
      )}

      <ItemPreviewSheet
        itemId={previewItemId}
        onClose={() => setPreviewItemId(null)}
        includeHidden
        includePrivate
      />
    </section>
  );
}
