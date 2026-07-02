"use client";

import { ArrowRight, Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { exportUrl } from "./api";
import { cn } from "@/lib/utils";

export function ExportSection() {
  return (
    <section
      className="border-border bg-surface-elevated/40 flex flex-col gap-4 rounded-sm border p-5"
      data-testid="export-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-foreground font-serif text-xl font-semibold">
          Export
        </h2>
        <p className="text-muted-foreground font-sans text-sm">
          Download all content items from your database.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <a
          href={exportUrl("markdown")}
          className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          data-testid="export-markdown"
        >
          <Download className="size-4" />
          Export all as Markdown
        </a>
        <a
          href={exportUrl("json")}
          className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          data-testid="export-json"
        >
          <Download className="size-4" />
          Export as JSON
        </a>
      </div>

      <div className="border-border border-t pt-4">
        <a
          href="/backup"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "text-muted-foreground hover:text-foreground w-full justify-start"
          )}
          data-testid="backup-link"
        >
          View backup guide
          <ArrowRight className="ml-auto size-4" />
        </a>
      </div>
    </section>
  );
}
