/**
 * Known model context window sizes (in tokens).
 * Used for the context window indicator in the chat UI.
 *
 * Fallback to 128k when the model is not in this map.
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenCode Go models
  deepseek: 128_000,
  "deepseek-v3": 128_000,
  "deepseek-v3-0324": 128_000,
  "deepseek-v3-flash": 128_000,
  "deepseek-r1": 128_000,
  "deepseek-r1-distill": 128_000,
  "deepseek-v3-pro": 128_000,
  "deepseek-v4-pro": 128_000,
  kimi: 128_000,
  "kimi-k2": 128_000,
  "kimi-k2-instruct": 128_000,
  glm: 128_000,
  "glm-4": 128_000,
  "glm-4-air": 128_000,
  "mimo-v2-flash": 128_000,
  "mimo-v2": 128_000,
  qwen: 128_000,
  "qwen-max": 128_000,
  "qwen-plus": 128_000,
  minimax: 128_000,
  "minimax-m1": 128_000,
  "minimax-m2": 128_000,
  "minimax-m2.5": 128_000,
  "minimax-m2.7": 128_000,
  "minimax-m3": 128_000,
  // Hermes
  "hermes-agent": 128_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Return the known context window size for a model ID.
 * Falls back to `DEFAULT_CONTEXT_WINDOW` (128k) when not found.
 */
export function getModelContextWindow(modelId: string): number {
  // Exact match
  if (modelId in MODEL_CONTEXT_WINDOWS) {
    return MODEL_CONTEXT_WINDOWS[modelId];
  }

  // Prefix match — sort by length descending so longer (more specific)
  // prefixes win over shorter ones (e.g. "deepseek-v3" before "deepseek").
  const sortedKeys = Object.keys(MODEL_CONTEXT_WINDOWS).sort(
    (a, b) => b.length - a.length
  );
  for (const key of sortedKeys) {
    if (modelId.startsWith(key)) {
      return MODEL_CONTEXT_WINDOWS[key];
    }
  }

  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Format a token count for display ("1.2k", "8", "0").
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    const k = tokens / 1000;
    // Show 1 decimal if < 10k, integer otherwise
    if (k < 10) {
      // Round to 1 decimal, drop trailing ".0"
      const rounded = Math.round(k * 10) / 10;
      return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}k`;
    }
    return `${Math.floor(k)}k`;
  }
  return String(tokens);
}

/**
 * Format a relative time string ("2m ago", "1h ago", "yesterday").
 */
export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin === 1) return "1m ago";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr === 1) return "1h ago";
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}
