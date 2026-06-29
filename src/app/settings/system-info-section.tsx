"use client";

import { useEffect, useState } from "react";

import { fetchSystemInfo } from "./api";
import type { SystemInfo } from "./types";

export function SystemInfoSection() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSystemInfo(controller.signal)
      .then((data) => {
        setInfo(data);
        setStatus("success");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, []);

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
