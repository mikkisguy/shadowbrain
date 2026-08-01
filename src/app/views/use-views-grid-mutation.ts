"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-config";

import type { ViewsVisibilityOptions } from "./use-views-grid-data";

type GridRowType = "event" | "task";

export interface GridMetadataPatch {
  id: string;
  type: GridRowType;
  metadata: Record<string, unknown>;
}

export function withVisibilityQuery(
  path: string,
  visibility?: ViewsVisibilityOptions
): string {
  const params = new URLSearchParams();
  if (visibility?.includeHidden) params.set("include_hidden", "1");
  if (visibility?.includePrivate) params.set("include_private", "1");
  const query = params.toString();
  if (!query) return path;
  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}

async function patchGridItem(
  { id, type, metadata }: GridMetadataPatch,
  visibility?: ViewsVisibilityOptions
): Promise<void> {
  const res = await fetch(withVisibilityQuery(`/api/items/${id}`, visibility), {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, metadata }),
  });

  if (!res.ok) {
    let message = "Failed to update item";
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      message = json.error?.message ?? message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
}

export function useViewsGridMutation(visibility: ViewsVisibilityOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: GridMetadataPatch) =>
      patchGridItem(variables, visibility),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.views.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });
      toast.success("Updated.");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to update item");
    },
  });
}

export function mergeGridMetadata(
  existing: Record<string, unknown>,
  changes: Record<string, unknown>
): Record<string, unknown> {
  return { ...existing, ...changes };
}
