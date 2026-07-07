import type { BackupSeverity } from "@/lib/backup/severity";

export function getSeverityColor(severity: Exclude<BackupSeverity, "hidden">): {
  bg: string;
  border: string;
  text: string;
  accent: string;
} {
  switch (severity) {
    case "gentle":
      return {
        bg: "bg-surface-elevated",
        border: "border-border",
        text: "text-muted-foreground",
        accent: "text-muted-foreground",
      };
    case "prominent":
      return {
        bg: "bg-warning/5",
        border: "border-warning/40",
        text: "text-warning",
        accent: "text-warning",
      };
    case "enforce":
      return {
        bg: "bg-error/5",
        border: "border-error/40",
        text: "text-error",
        accent: "text-error",
      };
  }
}
