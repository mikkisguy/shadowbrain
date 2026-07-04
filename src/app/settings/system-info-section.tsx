"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSystemInfo } from "./api";
import { queryKeys, staleTimes } from "@/lib/query-config";

export function SystemInfoSection() {
  const {
    data: info,
    isPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.settings.systemInfo,
    queryFn: ({ signal }) => fetchSystemInfo(signal),
    staleTime: staleTimes.systemInfo,
    refetchInterval: 30_000, // Refresh every 30s for live updates
  });

  const status = isPending ? "loading" : isError ? "error" : "success";

  return (
    <section
      className="border-border bg-surface-elevated/40 flex flex-col gap-4 rounded-sm border p-5"
      data-testid="system-info-section"
    >
      <header>
        <h2 className="text-foreground font-serif text-xl font-semibold">
          System info
        </h2>
      </header>

      {status === "loading" ? (
        <p className="text-muted-foreground font-sans text-sm">Loading…</p>
      ) : status === "error" ? (
        <p className="text-error font-sans text-sm">
          Could not load system info.
        </p>
      ) : info ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground font-mono text-xs uppercase">
              Total items
            </dt>
            <dd className="text-foreground font-sans text-sm">
              {info.totalItems}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground font-mono text-xs uppercase">
              Database size
            </dt>
            <dd className="text-foreground font-sans text-sm">
              {info.databaseSize}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground font-mono text-xs uppercase">
              Last backup
            </dt>
            <dd className="text-foreground font-sans text-sm">
              {info.lastBackupAt ?? "Never"}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
