/**
 * Format a model ID to be human-readable.
 * Converts "deepseek-v3-flash" to "Deepseek V3 Flash"
 */
export function formatModelName(modelId: string): string {
  return modelId
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
