"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-config";
import type { WorkflowStatusValue } from "@/lib/workflow-status";

import type { GridRow } from "./types";
import { mergeGridMetadata } from "./use-views-grid-mutation";

export interface MoveKanbanCardVariables {
  id: string;
  type: "event" | "task";
  fromStatus: WorkflowStatusValue;
  toStatus: WorkflowStatusValue;
  metadata: Record<string, unknown>;
}

interface KanbanMutationContext {
  previousRows: GridRow[] | undefined;
}

async function patchKanbanCard({
  id,
  type,
  toStatus,
  metadata,
}: MoveKanbanCardVariables): Promise<void> {
  const res = await fetch(`/api/items/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      metadata: mergeGridMetadata(metadata, { status: toStatus }),
    }),
  });

  if (!res.ok) {
    let message = "Failed to update item";
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      message = json.error?.message ?? message;
    } catch {
      // Keep the fallback when the response is not JSON.
    }
    throw new Error(message);
  }
}

export function useViewsKanbanMutation(projectId: string | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation<
    void,
    Error,
    MoveKanbanCardVariables,
    KanbanMutationContext
  >({
    mutationFn: (variables) =>
      variables.fromStatus === variables.toStatus
        ? Promise.resolve()
        : patchKanbanCard(variables),
    onMutate: async (variables) => {
      if (variables.fromStatus === variables.toStatus) {
        return { previousRows: undefined };
      }

      const queryKey = queryKeys.views.grid(projectId);
      await queryClient.cancelQueries({ queryKey });
      const previousRows = queryClient.getQueryData<GridRow[]>(queryKey);

      queryClient.setQueryData<GridRow[]>(queryKey, (rows) =>
        rows?.map((row) =>
          row.id === variables.id
            ? {
                ...row,
                status: variables.toStatus,
                metadata: mergeGridMetadata(row.metadata, {
                  status: variables.toStatus,
                }),
              }
            : row
        )
      );

      return { previousRows };
    },
    onError: (error, variables, context) => {
      if (variables.fromStatus !== variables.toStatus) {
        queryClient.setQueryData(
          queryKeys.views.grid(projectId),
          context?.previousRows
        );
      }
      toast.error(error.message ?? "Failed to update item");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.views.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.browse.all });
    },
  });

  return {
    ...mutation,
    moveCard: (variables: MoveKanbanCardVariables) => {
      if (variables.fromStatus !== variables.toStatus) {
        mutation.mutate(variables);
      }
    },
  };
}
