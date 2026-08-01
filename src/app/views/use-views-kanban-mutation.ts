"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryKeys, type ViewsGridQueryKey } from "@/lib/query-config";
import type { WorkflowStatusValue } from "@/lib/workflow-status";

import type { GridRow } from "./types";
import {
  mergeGridMetadata,
  withVisibilityQuery,
} from "./use-views-grid-mutation";
import type { ViewsVisibilityOptions } from "./use-views-grid-data";

export interface MoveKanbanCardVariables {
  id: string;
  type: "event" | "task";
  fromStatus: WorkflowStatusValue;
  toStatus: WorkflowStatusValue;
  metadata: Record<string, unknown>;
}
type KanbanGridQueryKey = ViewsGridQueryKey;

interface KanbanMutationContext {
  queryKey: KanbanGridQueryKey;
  previousRow: GridRow | undefined;
}

async function patchKanbanCard(
  { id, type, toStatus, metadata }: MoveKanbanCardVariables,
  visibility?: ViewsVisibilityOptions
): Promise<void> {
  const res = await fetch(withVisibilityQuery(`/api/items/${id}`, visibility), {
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

export function useViewsKanbanMutation(
  projectId: string | null,
  visibility: ViewsVisibilityOptions = {}
) {
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
        : patchKanbanCard(variables, visibility),
    onMutate: async (variables) => {
      const queryKey = queryKeys.views.grid(projectId, visibility);
      if (variables.fromStatus === variables.toStatus) {
        return { queryKey, previousRow: undefined };
      }

      await queryClient.cancelQueries({ queryKey });
      const rows = queryClient.getQueryData<GridRow[]>(queryKey);
      const previousRow = rows?.find((row) => row.id === variables.id);

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

      return { queryKey, previousRow };
    },
    onError: (error, variables, context) => {
      if (variables.fromStatus !== variables.toStatus && context?.previousRow) {
        queryClient.setQueryData<GridRow[]>(context.queryKey, (rows) =>
          rows?.map((row) =>
            row.id === context.previousRow?.id &&
            row.status === variables.toStatus
              ? context.previousRow
              : row
          )
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
