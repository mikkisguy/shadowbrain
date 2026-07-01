import { cn } from "@/lib/utils";

/**
 * CelestialBackdrop — a decorative celestial-chart engraving rendered as
 * inline SVG.
 *
 * This is the first concrete placement of the app's imagery direction
 * (antique star-chart / cartographic line-work, duotoned to the brand
 * palette). The treatment is deliberately restrained to honour the
 * design-system spec, which bans gradient-mesh backgrounds and
 * glassmorphism and reaches for hairlines, square corners, and depth by
 * colour contrast. SVG line-work *is* that hairline language, so it
 * reads as an engraving rather than a "nebula photo" (which would read
 * as AI slop). It also keeps the payload tiny — the login page is an
 * intentionally minimal server-rendered shell — and stays crisp at any
 * resolution.
 *
 * The whole layer is `pointer-events-none`, `aria-hidden`, and composites
 * in `mix-blend-mode: screen` so the dark engraving substrate vanishes
 * into the near-black canvas (`#0a0a0a`) and only the luminous
 * hairlines and stars read against it. It is a pure presentational
 * server component (no hooks, no client JS) so it adds zero client
 * bundle and hydrates nothing.
 *
 * Composition:
 *   - a faint nebula wash that continues the body's existing top vignette
 *     (see `globals.css`) so the backdrop reads as one continuous sky;
 *   - a sweeping ecliptic arc with engraved graduation ticks (astrolabe);
 *   - a "zodiac" constellation traced along the ecliptic — on-metaphor
 *     for the app (thoughts as connected nodes) — kept high so it frames
 *     the centered login card instead of sitting behind it;
 *   - two small corner constellations and a scattered star field, kept
 *     deliberately sparse through the central card region for legibility.
 *
 * Reuse: the empty-state, `/graph`, and type-specific item-hero
 * placements described in the imagery plan can mount this same component
 * with a different `className` (opacity, positioning) rather than each
 * rolling its own art.
 */

/** Brand-spectrum star colours (cool accents + cream for the brightest). */
const STAR_COLORS = [
  "var(--accent-cyan)",
  "var(--primary)",
  "var(--accent-violet)",
  "var(--foreground)",
] as const;

/** Ecliptic arc — apex above the centered card so it frames, not crosses. */
const ECLIPTIC_D = "M -120 520 Q 720 -180 1560 280";

/** The "zodiac" — bright stars traced along the ecliptic, left → right. */
const ZODIAC: ReadonlyArray<readonly [number, number]> = [
  [64, 381],
  [261, 267],
  [458, 185],
  [654, 135],
  [851, 116],
  [1048, 129],
  [1245, 174],
];

/** Brightest zodiac stars get engraved diffraction spikes (two hairlines). */
const SPIKED: ReadonlySet<string> = new Set(["458-185", "654-135", "851-116"]);

/** Lower-left corner cluster — fills negative space beside the card. */
const CORNER_LEFT: ReadonlyArray<readonly [number, number]> = [
  [90, 760],
  [180, 700],
  [150, 830],
  [270, 790],
  [250, 700],
];

/** Lower-right corner cluster. */
const CORNER_RIGHT: ReadonlyArray<readonly [number, number]> = [
  [1170, 740],
  [1280, 700],
  [1240, 820],
  [1350, 760],
  [1380, 670],
];

/**
 * Scattered field stars. The central card region (~520–920 × 180–720) is
 * intentionally sparse so the form stays legible.
 */
const FIELD: ReadonlyArray<readonly [number, number]> = [
  [40, 80],
  [120, 40],
  [200, 95],
  [70, 210],
  [280, 40],
  [360, 95],
  [50, 310],
  [160, 270],
  [390, 260],
  [250, 340],
  [500, 60],
  [560, 40],
  [880, 70],
  [960, 40],
  [1020, 80],
  [1100, 40],
  [1180, 95],
  [1260, 40],
  [1340, 95],
  [1390, 190],
  [1300, 250],
  [1180, 210],
  [1120, 310],
  [1260, 340],
  [1360, 310],
  [40, 650],
  [120, 690],
  [60, 790],
  [200, 650],
  [110, 860],
  [300, 860],
  [360, 810],
  [40, 560],
  [180, 600],
  [1100, 620],
  [1180, 660],
  [1260, 620],
  [1340, 690],
  [1290, 560],
  [1380, 720],
  [1240, 860],
  [1120, 820],
  [1360, 840],
  [1180, 880],
  [40, 420],
  [90, 480],
  [1390, 440],
  [1340, 500],
];

/** Graduation-tick anchors placed along the ecliptic (astrolabe engraving). */
const TICKS: ReadonlyArray<readonly [number, number]> = [
  [48, 392],
  [216, 286],
  [384, 204],
  [552, 146],
  [720, 110],
  [888, 98],
  [1056, 108],
  [1224, 142],
  [1392, 200],
];

/** Build an SVG polyline path (`M x y L x y …`) from a list of points. */
function linkPath(pts: ReadonlyArray<readonly [number, number]>): string {
  return "M " + pts.map(([x, y]) => `${x} ${y}`).join(" L ");
}

/**
 * Deterministically derive radius / opacity / colour for a field star from
 * its coordinates. No randomness — the result is identical on the server
 * and the client, so there is no hydration mismatch, and the field still
 * looks organically varied.
 */
function fieldStar(
  x: number,
  y: number
): {
  r: number;
  opacity: number;
  color: string;
} {
  const r = 0.5 + (((x * 13 + y * 7) % 10) / 10) * 1.3; // 0.5 … 1.8
  const opacity = 0.25 + (((x * 7 + y * 3) % 10) / 10) * 0.5; // 0.25 … 0.75
  const color = STAR_COLORS[(x + y) % STAR_COLORS.length]!;
  return { r, opacity, color };
}

export interface CelestialBackdropProps {
  /** Extra classes for the wrapper (opacity, positioning, blend tweaks). */
  className?: string;
}

export function CelestialBackdrop({
  className,
}: CelestialBackdropProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 mix-blend-screen",
        className
      )}
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          {/* Nebula wash — continues the body's top vignette so the sky
           * reads as one piece rather than a pasted-on layer. */}
          <radialGradient id="cb-nebula" cx="50%" cy="12%" r="65%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.1" />
            <stop
              offset="55%"
              stopColor="var(--accent-violet)"
              stopOpacity="0.035"
            />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1440" height="900" fill="url(#cb-nebula)" />

        {/* Celestial-sphere ring + ecliptic arc. */}
        <circle
          cx="720"
          cy="110"
          r="540"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.06"
          strokeWidth="1"
        />
        <path
          d={ECLIPTIC_D}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.12"
          strokeWidth="1"
        />

        {/* Graduation ticks — alternate major/minor like a real arc. */}
        <g stroke="var(--accent-cyan)" strokeOpacity="0.2" strokeWidth="1">
          {TICKS.map(([x, y], i) => (
            <line
              key={`tk-${i}`}
              x1={x}
              y1={y - (i % 2 === 0 ? 4 : 2)}
              x2={x}
              y2={y + (i % 2 === 0 ? 4 : 2)}
            />
          ))}
        </g>

        {/* Constellation hairline links. */}
        <path
          d={linkPath(ZODIAC)}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.16"
          strokeWidth="1"
        />
        <path
          d={linkPath(CORNER_LEFT)}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.12"
          strokeWidth="1"
        />
        <path
          d={linkPath(CORNER_RIGHT)}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.12"
          strokeWidth="1"
        />

        {/* Soft glow halos behind the brightest zodiac stars. */}
        {ZODIAC.filter(([x, y]) => SPIKED.has(`${x}-${y}`)).map(([x, y]) => (
          <circle
            key={`halo-${x}-${y}`}
            cx={x}
            cy={y}
            r="4"
            fill="var(--primary)"
            fillOpacity="0.08"
          />
        ))}

        {/* Diffraction spikes on the brightest zodiac stars. */}
        <g stroke="var(--foreground)" strokeOpacity="0.3" strokeWidth="1">
          {ZODIAC.filter(([x, y]) => SPIKED.has(`${x}-${y}`)).map(([x, y]) => (
            <g key={`spike-${x}-${y}`}>
              <line x1={x} y1={y - 9} x2={x} y2={y + 9} />
              <line x1={x - 9} y1={y} x2={x + 9} y2={y} />
            </g>
          ))}
        </g>

        {/* Constellation stars: zodiac cream (bright), corners cyan. */}
        {[...ZODIAC, ...CORNER_LEFT, ...CORNER_RIGHT].map(([x, y], i) => (
          <circle
            key={`star-${i}`}
            cx={x}
            cy={y}
            r="1.7"
            fill={
              i < ZODIAC.length ? "var(--foreground)" : "var(--accent-cyan)"
            }
            fillOpacity={i < ZODIAC.length ? 0.85 : 0.6}
          />
        ))}

        {/* Scattered field. */}
        {FIELD.map(([x, y], i) => {
          const { r, opacity, color } = fieldStar(x, y);
          return (
            <circle
              key={`field-${i}`}
              cx={x}
              cy={y}
              r={r}
              fill={color}
              fillOpacity={opacity}
            />
          );
        })}
      </svg>
    </div>
  );
}
