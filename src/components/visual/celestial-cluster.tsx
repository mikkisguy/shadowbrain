import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * CelestialCluster — empty-state glyph
 * ------------------------------------------------------------------ */

export interface CelestialClusterProps {
  /** Extra classes on the wrapper (sizing / margin). */
  className?: string;
}

/** A constellation node: position in the 64 × 44 viewBox + its radius. */
interface Node {
  x: number;
  y: number;
  r: number;
  /** The focal star is drawn cream with a halo; the rest are cyan. */
  focal?: boolean;
}

/**
 * A small five-star asterism (a Cassiopeia-like "W"), traced as one
 * continuous hairline so no node radiates more than two links.
 */
const NODES: readonly Node[] = [
  { x: 8, y: 31, r: 1.1 },
  { x: 22, y: 13, r: 1.7, focal: true },
  { x: 36, y: 24, r: 1.3 },
  { x: 50, y: 11, r: 1.4 },
  { x: 57, y: 33, r: 1.1 },
];

/** Faint field stars scattered around the asterism for depth/sky. */
const FIELD: ReadonlyArray<{
  x: number;
  y: number;
  r: number;
  /** fill-opacity — these stay quiet so the asterism stays the focus. */
  o: number;
  c: string;
}> = [
  { x: 10, y: 7, r: 0.6, o: 0.3, c: "var(--accent-cyan)" },
  { x: 40, y: 4, r: 0.5, o: 0.28, c: "var(--accent-violet)" },
  { x: 58, y: 9, r: 0.6, o: 0.3, c: "var(--foreground)" },
  { x: 5, y: 22, r: 0.5, o: 0.22, c: "var(--accent-cyan)" },
  { x: 30, y: 38, r: 0.5, o: 0.2, c: "var(--foreground)" },
  { x: 45, y: 38, r: 0.7, o: 0.25, c: "var(--accent-violet)" },
  { x: 56, y: 31, r: 0.5, o: 0.22, c: "var(--accent-cyan)" },
];

export function CelestialCluster({
  className,
}: CelestialClusterProps): React.ReactElement {
  const link = "M " + NODES.map(({ x, y }) => `${x} ${y}`).join(" L ");
  const focal = NODES.find((n) => n.focal);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none mx-auto w-16", className)}
    >
      <svg viewBox="0 0 64 44" className="block h-11 w-16" fill="none">
        <defs>
          {/* Soft nebula glow behind the focal star — atmosphere, not a
           * glow mesh (the design spec bans those). */}
          <radialGradient id="cc-nebula" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="var(--accent-violet)"
              stopOpacity="0.2"
            />
            <stop offset="60%" stopColor="var(--primary)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Nebula wash behind the focal star. */}
        {focal ? (
          <ellipse
            cx={focal.x}
            cy={focal.y}
            rx="15"
            ry="12"
            fill="url(#cc-nebula)"
          />
        ) : null}

        {/* Faint ecliptic arc — a fragment of the celestial sphere. */}
        <path
          d="M -2 42 Q 30 12 66 24"
          stroke="var(--primary)"
          strokeOpacity="0.12"
          strokeWidth="1"
        />

        {/* Constellation hairline — a single trace, no branching. */}
        <path
          d={link}
          stroke="var(--primary)"
          strokeOpacity="0.3"
          strokeWidth="1"
        />

        {/* Scattered field stars for depth. */}
        {FIELD.map(({ x, y, r, o, c }) => (
          <circle
            key={`field-${x}-${y}`}
            cx={x}
            cy={y}
            r={r}
            fill={c}
            fillOpacity={o}
          />
        ))}

        {/* Soft halo behind the focal star (no diffraction spikes). */}
        {focal ? (
          <circle
            cx={focal.x}
            cy={focal.y}
            r="4.5"
            fill="var(--primary)"
            fillOpacity="0.1"
          />
        ) : null}

        {/* The asterism stars. */}
        {NODES.map(({ x, y, r, focal: isFocal }) => (
          <circle
            key={`node-${x}-${y}`}
            cx={x}
            cy={y}
            r={r}
            fill={isFocal ? "var(--foreground)" : "var(--accent-cyan)"}
            fillOpacity={isFocal ? 0.75 : 0.5}
          />
        ))}
      </svg>
    </div>
  );
}
