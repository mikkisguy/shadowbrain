"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-config";

type GridRowType = "event" | "task";

export interface GridMetadataPatch {
  id: string;
  type: GridRowType;
  metadata: Record<string, unknown>;
}

async function patchGridItem({
  id,
  type,
  metadata,
}: GridMetadataPatch): Promise<void> {
  const res = await fetch(`/api/items/${id}`, {
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

export function useViewsGridMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patchGridItem,
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
