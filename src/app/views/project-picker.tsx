"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Combobox } from "@/components/ui/combobox";
import { queryKeys, staleTimes } from "@/lib/query-config";

interface ProjectOption {
  id: string;
  title: string | null;
}

interface ItemsListResponse {
  items: ProjectOption[];
}

async function fetchProjects(signal?: AbortSignal): Promise<ProjectOption[]> {
  const res = await fetch("/api/items?type=project&limit=100", { signal });
  if (!res.ok) {
    throw new Error("Failed to load projects");
  }
  const data = (await res.json()) as ItemsListResponse;
  return data.items ?? [];
}

export interface ProjectPickerProps {
  projectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  disabled?: boolean;
}

export function ProjectPicker({
  projectId,
  onProjectChange,
  disabled,
}: ProjectPickerProps) {
  const { data: projects, isLoading } = useQuery({
    queryKey: queryKeys.views.projects(""),
    queryFn: ({ signal }) => fetchProjects(signal),
    staleTime: staleTimes.views,
  });

  const options = useMemo(() => {
    const list = projects ?? [];
    const mapped = list.map((project) => ({
      value: project.id,
      label: project.title?.trim() || "Untitled project",
    }));

    if (projectId && !mapped.some((option) => option.value === projectId)) {
      mapped.unshift({
        value: projectId,
        label: "Selected project",
      });
    }

    return mapped;
  }, [projects, projectId]);

  return (
    <Combobox
      options={options}
      value={projectId}
      onValueChange={onProjectChange}
      placeholder={isLoading ? "Loading projects…" : "All projects"}
      emptyMessage="No projects found."
      aria-label="Filter by project"
      data-testid="project-picker"
      disabled={disabled || isLoading}
      className="min-w-[14rem]"
    />
  );
}
