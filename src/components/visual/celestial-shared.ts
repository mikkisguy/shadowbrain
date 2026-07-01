/**
 * Shared primitives for the celestial engravings
 * (`CelestialBackdrop`, `CelestialCluster`, `CelestialHeader`).
 *
 * Kept dependency-free (no React) so it can be imported by both server
 * and client components without pulling anything into the wrong bundle.
 */

/** Brand-spectrum star colours (cool accents + cream for the brightest). */
const STAR_COLORS = [
  "var(--accent-cyan)",
  "var(--primary)",
  "var(--accent-violet)",
  "var(--foreground)",
] as const;

/** Build an SVG polyline path (`M x y L x y …`) from a list of points. */
export function linkPath(
  pts: ReadonlyArray<readonly [number, number]>
): string {
  return "M " + pts.map(([x, y]) => `${x} ${y}`).join(" L ");
}

/**
 * Deterministically derive radius / opacity / colour for a field star
 * from its coordinates. No randomness — the result is identical on the
 * server and the client (no hydration mismatch) while still looking
 * organically varied.
 */
export function fieldStar(
  x: number,
  y: number
): { r: number; opacity: number; color: string } {
  const r = 0.5 + (((x * 13 + y * 7) % 10) / 10) * 1.3; // 0.5 … 1.8
  const opacity = 0.15 + (((x * 7 + y * 3) % 10) / 10) * 0.35; // 0.15 … 0.5
  const color = STAR_COLORS[(x + y) % STAR_COLORS.length]!;
  return { r, opacity, color };
}
