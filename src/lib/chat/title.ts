const TITLE_TRUNCATE_LENGTH = 80;

/**
 * Derive a thread title from a user message.
 * Collapses whitespace and truncates to 80 characters.
 */
export function deriveTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= TITLE_TRUNCATE_LENGTH) return cleaned;
  return cleaned.slice(0, TITLE_TRUNCATE_LENGTH);
}
