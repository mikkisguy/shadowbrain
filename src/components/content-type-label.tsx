import { typeColorClass, typeLabel } from "@/lib/content-types";
import { cn } from "@/lib/utils";

export interface ContentTypeLabelProps {
  type: string;
  /** Override the display label; defaults to `typeLabel(type)`. */
  label?: string;
  className?: string;
  /** Dot size variant — matches browse type tabs (`sm`) or feed cards (`md`). */
  dotSize?: "sm" | "md";
}

/** Coloured type dot + human-readable label, keyed to `--color-type-*` tokens. */
export function ContentTypeLabel({
  type,
  label,
  className,
  dotSize = "sm",
}: ContentTypeLabelProps) {
  const displayLabel = label ?? typeLabel(type);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "shrink-0 rounded-full",
          dotSize === "sm" ? "size-1.5" : "size-2",
          typeColorClass(type)
        )}
      />
      <span>{displayLabel}</span>
    </span>
  );
}
