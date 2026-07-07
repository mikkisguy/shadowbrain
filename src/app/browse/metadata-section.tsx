"use client";

import { useMemo } from "react";
import { extractMetadataFields } from "@/lib/metadata-fields";
import { formatAbsolute } from "@/lib/dates";

export function MetadataSection({
  type,
  metadata,
}: {
  type: string;
  metadata: string | null;
}) {
  const fields = useMemo(
    () => extractMetadataFields(type, metadata, formatAbsolute),
    [type, metadata]
  );

  if (!fields) return null;

  return (
    <section
      className="border-border bg-surface-elevated flex flex-col gap-3 rounded-sm border p-4"
      aria-label="Metadata"
    >
      <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-wide uppercase">
        Metadata
      </h3>
      <dl className="text-sm">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-4 py-0.5">
            <dt className="text-muted-foreground min-w-20 font-medium">
              {f.label}
            </dt>
            <dd className="text-foreground wrap-break-word">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
