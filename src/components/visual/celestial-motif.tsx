import { fieldStar, linkPath } from "@/components/visual/celestial-shared";
import { cn } from "@/lib/utils";

/**
 * Celestial engravings — the compact, placement-specific companions to
 * {@link CelestialBackdrop}.
 *
 * `CelestialBackdrop` is a full-bleed layer meant for whole surfaces
 * (the login card, the tags list). It does not belong inside a small
 * dashed empty-state card, nor is it the right call behind a content
 * feed (where "content is the hero"). These components carry the *same*
 * engraved line-work vocabulary (hairlines, duotoned to the brand
 * spectrum, no shadow/glow mesh) into the tighter or more sensitive
 * placements:
 *
 *   - {@link CelestialCluster} — a small constellation glyph for bare
 *     empty-state surfaces.
 *   - {@link CelestialHeader} — a horizontal "title plate" for page
 *     headers, confined to the header band so it frames a heading
 *     without competing with the content below.
 *
 * Both are pure presentational components (`aria-hidden`,
 * `pointer-events-none`) with no hooks or event handlers, so they render
 * as static SVG markup and hydrate nothing. They carry no `"use client"`
 * directive of their own, but `CelestialHeader` is imported by client
 * pages (browse, settings) and so travels in those client bundles — the
 * line-work is small enough that this is a non-issue. Like the backdrop
 * they composite in `mix-blend-screen` so only the luminous hairlines
 * read against the near-black substrate.
 *
 * Note on the diffraction spikes the backdrop uses: they are omitted
 * here. A symmetric cross of hairlines through a central node reads as
 * an insect, not a star, and at these smaller scales it fights the
 * constellation metaphor — so the focal stars carry only a soft halo.
 */

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
