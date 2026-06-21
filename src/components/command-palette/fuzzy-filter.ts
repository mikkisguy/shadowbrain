/**
 * Subsequence-based fuzzy matcher.
 *
 * A query matches a haystack if the query characters appear in
 * the haystack in order (case-insensitive), with any characters
 * between them. So `br` matches `Browse`, `bwa` does not. This
 * is the same model the macOS / iOS file picker uses; it is
 * enough for ~10 page items and avoids a fuse.js dependency.
 *
 * The function returns a numeric score so the caller can rank
 * the matches:
 *
 *   - 0         → no match (the item should be hidden)
 *   - positive  → match; higher is better
 *
 * The score prefers:
 *
 *   1. Exact-prefix matches (e.g. `br` against `Browse`) so
 *      the user gets the first-page-of-the-list hit.
 *   2. Subsequence matches earlier in the haystack (so `g` in
 *      `Graph` ranks above `g` in `Tags`).
 *   3. Consecutive matches (so `set` ranks above `s_e_t`).
 *   4. Shorter haystacks (so the right result wins when two
 *      items match equally well).
 *
 * The score is bounded so two items that differ only by an
 * unmatched character do not produce wildly different numbers
 * — the constants below are the result of a few minutes of
 * tuning, not a theoretical optimum.
 */

const NO_MATCH = 0;
const PREFIX_BONUS = 100;
const START_BONUS = 10;
const CONSECUTIVE_BONUS = 5;
const MAX_LEN_PENALTY = 5;

/**
 * Score a haystack against a query. Returns 0 when the query
 * does not appear as a subsequence of the haystack.
 */
export function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 1; // empty query matches everything, neutrally
  if (!haystack) return NO_MATCH;

  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  let needleIdx = 0;
  let score = 0;
  let lastMatchIdx = -2; // -2 so first match is not "consecutive"
  let matchedAny = false;

  for (let hayIdx = 0; hayIdx < h.length && needleIdx < n.length; hayIdx++) {
    if (h[hayIdx] === n[needleIdx]) {
      matchedAny = true;
      if (hayIdx === 0) score += START_BONUS;
      if (hayIdx === needleIdx) score += PREFIX_BONUS;
      if (hayIdx === lastMatchIdx + 1) score += CONSECUTIVE_BONUS;
      lastMatchIdx = hayIdx;
      needleIdx++;
    }
  }

  if (needleIdx < n.length) return NO_MATCH;
  if (!matchedAny) return NO_MATCH;

  // Tie-breaker: shorter haystacks beat longer ones so a
  // tight match wins. The penalty is bounded so two items
  // with very different lengths do not produce wildly
  // different scores.
  score -= Math.min(haystack.length, MAX_LEN_PENALTY * 4) / 4;
  return score;
}

/** Convenience: returns the items whose score is > 0, sorted
 *  best-first. An empty query returns the input in order (the
 *  default view of the palette). */
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  fields: (item: T) => string
): T[] {
  if (!query.trim()) return items.slice();
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, fields(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}
