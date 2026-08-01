"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowRight, ChevronDown, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IMPORT_GUIDE_EXAMPLE_JSON } from "@/lib/data-export/guide";
import { IMPORT_MAX_BYTES } from "@/lib/data-export/limits";
import {
  exportUrl,
  importJsonData,
  importSchemaUrl,
  importTemplateUrl,
  SettingsApiError,
} from "./api";

interface ImportPreview {
  data: unknown;
  itemCount: number | null;
  tagCount: number | null;
  linkCount: number | null;
}

function getImportPreview(data: unknown): ImportPreview {
  if (Array.isArray(data)) {
    return {
      data,
      itemCount: data.length,
      tagCount: null,
      linkCount: null,
    };
  }

  if (data && typeof data === "object") {
    const envelope = data as Record<string, unknown>;
    return {
      data,
      itemCount: Array.isArray(envelope.items) ? envelope.items.length : null,
      tagCount: Array.isArray(envelope.tags) ? envelope.tags.length : null,
      linkCount: Array.isArray(envelope.links) ? envelope.links.length : null,
    };
  }

  return { data, itemCount: null, tagCount: null, linkCount: null };
}

function ActionGroup({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex flex-col gap-1">
        <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-[0.12em] uppercase">
          {title}
        </h3>
        {description ? (
          <p className="text-muted-foreground font-sans text-xs">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function ExportSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null
  );
  const [isImporting, setIsImporting] = useState(false);
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > IMPORT_MAX_BYTES) {
      toast.error(
        `Selected file is too large. The maximum import size is ${IMPORT_MAX_BYTES / (1024 * 1024)} MiB.`
      );
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setImportPreview(getImportPreview(parsed));
    } catch {
      toast.error("Could not read that file as valid JSON.");
    }
  };

  const handleImportConfirm = async () => {
    if (!importPreview || isImporting) return;

    setIsImporting(true);
    try {
      const summary = await importJsonData(importPreview.data);
      toast.success(
        `Import complete: ${summary.created.items} items, ${summary.created.tags} tags, ${summary.created.item_tags} item tags, ${summary.created.links} links, ${summary.created.journal_periods} journal periods created; ${summary.reused_tags} existing tags reused.`
      );
      summary.warnings.forEach((warning) => toast.warning(warning));
      setImportPreview(null);
    } catch (error) {
      if (error instanceof SettingsApiError && error.issues.length > 0) {
        toast.error(`${error.message}: ${error.issues.join("; ")}`);
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not import the selected JSON file."
        );
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section
      className="border-border bg-surface-elevated/40 flex flex-col gap-5 rounded-sm border p-5"
      data-testid="export-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-foreground font-serif text-xl font-semibold">
          Export &amp; Import
        </h2>
        <p className="text-muted-foreground font-sans text-sm">
          Download your content, or merge a JSON file into this database.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <ActionGroup title="Export" testId="export-actions">
          <a
            href={exportUrl("markdown")}
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            data-testid="export-markdown"
          >
            <Download className="size-4" />
            Markdown
          </a>
          <a
            href={exportUrl("json")}
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            data-testid="export-json"
          >
            <Download className="size-4" />
            JSON
          </a>
        </ActionGroup>

        <ActionGroup
          title="Import"
          description="Merge creates new item IDs and never overwrites existing content."
          testId="import-actions"
        >
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            data-testid="import-json-button"
          >
            <Upload className="size-4" />
            Import JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
            data-testid="import-json-input"
          />
        </ActionGroup>
      </div>

      <div
        className="border-border flex flex-col gap-3 border-t pt-4"
        data-testid="import-format-guide"
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-[0.12em] uppercase">
            Format helpers
          </h3>
          <p className="text-muted-foreground font-sans text-xs">
            Envelope format is <code>shadowbrain-export</code> version 1 with{" "}
            <code>items</code>, <code>tags</code>, <code>item_tags</code>,{" "}
            <code>links</code>, and <code>journal_periods</code>. Image binaries
            are excluded, and every imported <code>image_path</code> is
            discarded and stored as <code>null</code>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={importSchemaUrl()}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5"
            )}
            data-testid="import-schema"
          >
            <Download className="size-3.5" />
            JSON Schema
          </a>
          <a
            href={importTemplateUrl()}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5"
            )}
            data-testid="import-template"
          >
            <Download className="size-3.5" />
            Import template
          </a>
        </div>

        <details
          className="border-border bg-muted/20 group rounded-sm border"
          data-testid="import-example-details"
        >
          <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-sans text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
            Show example JSON
          </summary>
          <div className="border-border flex flex-col gap-2 border-t px-3 py-3">
            <p className="text-muted-foreground text-xs">
              Valid minimal example (same shape as the downloadable template).
            </p>
            <pre className="border-border bg-muted/40 text-muted-foreground overflow-x-auto rounded-sm border p-3 font-mono text-xs leading-relaxed">
              <code>{IMPORT_GUIDE_EXAMPLE_JSON}</code>
            </pre>
          </div>
        </details>
      </div>

      <Dialog
        open={importPreview !== null}
        onOpenChange={(open) => {
          if (!open && !isImporting) setImportPreview(null);
        }}
      >
        <DialogContent showCloseButton={!isImporting}>
          <DialogHeader>
            <DialogTitle>Confirm JSON import</DialogTitle>
            <DialogDescription>
              Review the selected data before merging it into ShadowBrain.
            </DialogDescription>
          </DialogHeader>

          <div className="text-muted-foreground flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {importPreview !== null && importPreview.itemCount !== null && (
                <span>{importPreview.itemCount} items</span>
              )}
              {importPreview !== null && importPreview.tagCount !== null && (
                <span>{importPreview.tagCount} tags</span>
              )}
              {importPreview !== null && importPreview.linkCount !== null && (
                <span>{importPreview.linkCount} links</span>
              )}
            </div>

            <p>
              Merge import creates new IDs and never overwrites existing items.
              Image binaries are excluded; every imported image_path is
              discarded and stored as null.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isImporting}
              onClick={() => setImportPreview(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="inverted"
              disabled={isImporting}
              onClick={handleImportConfirm}
              data-testid="import-json-confirm"
            >
              {isImporting ? "Importing…" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
