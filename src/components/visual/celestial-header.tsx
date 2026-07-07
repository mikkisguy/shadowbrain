import { fieldStar, linkPath } from "@/components/visual/celestial-shared";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * CelestialHeader — title-plate band for page headers
 * ------------------------------------------------------------------ */

/**
 * Base (unshifted) composition coordinates for the 1440 × 200 header
 * band. The whole engraving is nudged vertically via the `headerShift`
 * prop on {@link CelestialHeader}; these are the resting positions at
 * `headerShift = 0`, so the default render is unchanged.
 */

/** The "zodiac" — bright stars tracing the ecliptic, left → right. */
const HEADER_ZODIAC: ReadonlyArray<readonly [number, number]> = [
  [150, 140],
  [370, 100],
  [600, 74],
  [820, 70],
  [1040, 88],
  [1250, 116],
];

/** Brightest zodiac stars get a soft halo (matched on base coords). */
const HEADER_BRIGHTEST: ReadonlySet<string> = new Set(["600-74", "820-70"]);

/** Graduation-tick anchors placed along the ecliptic (astrolabe). */
const HEADER_TICKS: ReadonlyArray<readonly [number, number]> = [
  [96, 146],
  [252, 127],
  [408, 112],
  [564, 101],
  [720, 95],
  [876, 93],
  [1032, 96],
  [1188, 103],
  [1344, 114],
];

/** Scattered field stars — faint, for depth. */
const HEADER_FIELD: ReadonlyArray<readonly [number, number]> = [
  [60, 40],
  [160, 70],
  [260, 35],
  [340, 60],
  [440, 150],
  [540, 40],
  [680, 150],
  [800, 40],
  [920, 150],
  [1020, 45],
  [1140, 150],
  [1240, 45],
  [1340, 150],
  [1400, 70],
];

export interface CelestialHeaderProps {
  /** Extra classes for the wrapper (opacity / positioning tweaks). */
  className?: string;
  /**
   * Vertical offset (in viewBox units) applied to the whole engraving.
   * Defaults to `0` (resting position). Pass a negative value such as
   * `-15` to nudge the composition down a little for header placements.
   */
  headerShift?: number;
}

/**
 * A horizontal "title plate" engraving for page headers — the same
 * celestial language as the backdrop (nebula wash, ecliptic arc with
 * astrolabe ticks, a tracing constellation, scattered field) but
 * composed for a short wide band, so it can frame a heading without
 * competing with the content below it.
 *
 * Mount it inside a `relative overflow-hidden` header and lift the
 * heading text to `z-10` so it reads above the (very faint) line-work.
 * Like the backdrop it composites in `mix-blend-screen`, so against the
 * near-black canvas only the luminous hairlines and stars read.
 */
export function CelestialHeader({
  className,
  headerShift = 0,
}: CelestialHeaderProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 mix-blend-screen",
        "mask-[linear-gradient(to_bottom,black_40%,black_70%,transparent_100%)]",
        className
      )}
    >
      <svg
        viewBox="0 0 1440 200"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          {/* Nebula wash — a faint sky behind the heading. */}
          <radialGradient id="ch-nebula" cx="50%" cy="20%" r="55%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.05" />
            <stop
              offset="55%"
              stopColor="var(--accent-violet)"
              stopOpacity="0.02"
            />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Full-bleed nebula wash — outside the shift group so the sky
         * stays anchored to the header band regardless of `headerShift`. */}
        <rect width="1440" height="200" fill="url(#ch-nebula)" />

        {/* The whole engraving shifts together via one group transform, so
         * every coordinate below stays at its resting (unshifted) value. */}
        <g transform={`translate(0 ${-headerShift})`}>
          {/* Ecliptic arc. */}
          <path
            d="M -60 170 Q 720 40 1500 130"
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.08"
            strokeWidth="1"
          />

          {/* Graduation ticks — alternate major/minor like a real arc. */}
          <g stroke="var(--accent-cyan)" strokeOpacity="0.12" strokeWidth="1">
            {HEADER_TICKS.map(([x, y], i) => (
              <line
                key={`htk-${i}`}
                x1={x}
                y1={y - (i % 2 === 0 ? 4 : 2)}
                x2={x}
                y2={y + (i % 2 === 0 ? 4 : 2)}
              />
            ))}
          </g>

          {/* Constellation hairline. */}
          <path
            d={linkPath(HEADER_ZODIAC)}
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.1"
            strokeWidth="1"
          />

          {/* Soft halos behind the brightest zodiac stars. */}
          {HEADER_ZODIAC.filter(([x, y]) =>
            HEADER_BRIGHTEST.has(`${x}-${y}`)
          ).map(([x, y]) => (
            <circle
              key={`hhalo-${x}-${y}`}
              cx={x}
              cy={y}
              r="4"
              fill="var(--primary)"
              fillOpacity="0.05"
            />
          ))}

          {/* Zodiac stars (cream, bright). */}
          {HEADER_ZODIAC.map(([x, y], i) => (
            <circle
              key={`hstar-${i}`}
              cx={x}
              cy={y}
              r="1.7"
              fill="var(--foreground)"
              fillOpacity="0.6"
            />
          ))}

          {/* Scattered field. */}
          {HEADER_FIELD.map(([x, y], i) => {
            const { r, opacity, color } = fieldStar(x, y);
            return (
              <circle
                key={`hfield-${i}`}
                cx={x}
                cy={y}
                r={r}
                fill={color}
                fillOpacity={opacity}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
