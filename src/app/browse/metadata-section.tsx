import { extractMetadataFields } from "@/lib/metadata-fields";
import { formatAbsolute } from "@/lib/dates";

export function MetadataSection({
  type,
  metadata,
  excludeLabels,
}: {
  type: string;
  metadata: string | null;
  excludeLabels?: string[];
}) {
  const extracted = extractMetadataFields(type, metadata, formatAbsolute);
  if (!extracted) return null;

  const fields = (() => {
    if (!excludeLabels?.length) return extracted;
    const excluded = new Set(excludeLabels);
    const filtered = extracted.filter((field) => !excluded.has(field.label));
    return filtered.length > 0 ? filtered : null;
  })();

  if (!fields) return null;

  return (
    <section
      className="border-border bg-surface-elevated flex flex-col gap-3.5 rounded-sm border px-4 pt-3.5 pb-4"
      aria-label="Metadata"
    >
      <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-wide uppercase">
        Metadata
      </h3>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {fields.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-muted-foreground font-medium">{f.label}</dt>
            <dd className="text-foreground min-w-0 wrap-break-word">
              {f.href ? (
                <a
                  href={f.href}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="text-primary break-all hover:underline"
                >
                  {f.value}
                </a>
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
