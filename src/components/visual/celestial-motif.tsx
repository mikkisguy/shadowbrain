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
 *   - {@link CelestialArtifact} — a tiny, seed-stable decoration for
 *     filling the incidental whitespace in cards when the grid row
 *     stretches them taller than their text content.
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

/* ------------------------------------------------------------------ *
 * CelestialArtifact — tiny decorative filler for card whitespace
 * ------------------------------------------------------------------ */

export interface CelestialArtifactProps {
  /** Deterministic seed so the same card always renders the same
   *  variant (no hydration mismatch). Typically the item's `id`. */
  seed: string;
  /** Extra classes for the wrapper (positioning / sizing). */
  className?: string;
}

/** Simple FNV-1a-style hash for deterministic variant selection. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** A handful of celestial decorations — constellations, nebula washes,
 *  field stars, and ecliptic arcs — rendered at 160×160 viewBox / 80 px.
 *  Each variant is a tiny standalone scene, not just a few dots. */
type ArtifactVariant = (ctx: {
  /** Fraction 0…1 for varying sub-elements of the chosen variant. */
  t: number;
  /** Unique suffix for gradient IDs (prevents cross-card collisions). */
  sid: string;
}) => React.ReactElement;

/** Helper: a faint field star with deterministic size/colour variation. */
function Field({ x, y, ix }: { x: number; y: number; ix: number }) {
  const r = 0.9 + (((ix * 7) % 100) / 100) * 1.2;
  const colors = [
    "var(--accent-cyan)",
    "var(--accent-violet)",
    "var(--foreground)",
  ];
  const c = colors[(x + y + ix) % colors.length]!;
  const o = 0.12 + (((ix * 3) % 100) / 100) * 0.25;
  return <circle cx={x} cy={y} r={r} fill={c} fillOpacity={o} />;
}

const ARTIFACTS: readonly ArtifactVariant[] = [
  // 0 — Constellation: 5 stars connected by a thin hairline, with
  //     a violet nebula wash, field stars, and a focal star halo.
  ({ t, sid }) => {
    const stars: [number, number, number][] = [
      [30, 120, 3.2],
      [56, 78, 2.8],
      [78, 32, 4.5],
      [104, 62, 3.0],
      [130, 118, 3.5],
    ];
    const link = "M " + stars.map(([sx, sy]) => `${sx} ${sy}`).join(" L ");
    const field = [
      [18, 30],
      [42, 18],
      [92, 100],
      [24, 82],
      [118, 30],
      [48, 110],
      [138, 78],
      [108, 14],
    ];
    const gid = `ca-nebula-${sid}`;
    return (
      <>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--accent-violet)"
            stopOpacity="0.12"
          />
          <stop offset="60%" stopColor="var(--primary)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <ellipse cx="78" cy="32" rx="40" ry="30" fill={`url(#${gid})`} />
        {/* Ecliptic arc fragment. */}
        <path
          d="M -10 50 Q 50 90 170 40"
          stroke="var(--primary)"
          strokeOpacity="0.06"
          strokeWidth="1"
          fill="none"
        />
        {/* Constellation hairline. */}
        <path
          d={link}
          stroke="var(--accent-cyan)"
          strokeOpacity="0.22"
          strokeWidth="1.2"
          fill="none"
        />
        {/* Focal star halo. */}
        <circle
          cx="78"
          cy="32"
          r="10"
          fill="var(--foreground)"
          fillOpacity="0.08"
        />
        {/* Constellation stars. */}
        {stars.map(([x, y, r], i) => (
          <circle
            key={`cs-${i}`}
            cx={x}
            cy={y}
            r={r}
            fill={i === 2 ? "var(--foreground)" : "var(--accent-cyan)"}
            fillOpacity={i === 2 ? 0.7 : 0.45}
          />
        ))}
        {/* Field stars. */}
        {field.map(([fx, fy], i) => (
          <Field key={`f-${i}`} x={fx} y={fy} ix={i} />
        ))}
      </>
    );
  },

  // 1 — Binary system: two bright stars with halos connected by a
  //     fine line, surrounded by an orbital arc and field stars.
  ({ t, sid }) => {
    const c1 = { x: 48, y: 110 };
    const c2 = { x: 112, y: 52 };
    const field = [
      [22, 24],
      [84, 18],
      [40, 52],
      [132, 94],
      [98, 130],
      [62, 42],
      [140, 30],
      [18, 88],
    ];
    const gid = `ca-nebula-${sid}`;
    return (
      <>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.1" />
          <stop offset="60%" stopColor="var(--primary)" stopOpacity="0.03" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <ellipse cx="80" cy="80" rx="45" ry="35" fill={`url(#${gid})`} />
        {/* Faint orbital arc suggesting binary motion. */}
        <path
          d="M 20 70 Q 80 0 140 70"
          stroke="var(--primary)"
          strokeOpacity="0.05"
          strokeWidth="1"
          fill="none"
        />
        {/* Connection line. */}
        <path
          d={`M ${c1.x} ${c1.y} L ${c2.x} ${c2.y}`}
          stroke="var(--accent-cyan)"
          strokeOpacity="0.3"
          strokeWidth="1.2"
        />
        {/* Halos. */}
        <circle
          cx={c1.x}
          cy={c1.y}
          r="9"
          fill="var(--accent-cyan)"
          fillOpacity="0.08"
        />
        <circle
          cx={c2.x}
          cy={c2.y}
          r="11"
          fill="var(--foreground)"
          fillOpacity="0.08"
        />
        {/* Stars. */}
        <circle
          cx={c1.x}
          cy={c1.y}
          r="3.8"
          fill="var(--accent-cyan)"
          fillOpacity="0.65"
        />
        <circle
          cx={c2.x}
          cy={c2.y}
          r="4.5"
          fill="var(--foreground)"
          fillOpacity="0.72"
        />
        {field.map(([fx, fy], i) => (
          <Field key={`f-${i}`} x={fx} y={fy} ix={i} />
        ))}
      </>
    );
  },

  // 2 — Astrolabe fragment: an ecliptic arc with graduation ticks,
  //     a highlight star at each end, and a dusting of field stars.
  ({ t, sid }) => {
    const ticks: [number, number][] = [
      [28, 102],
      [46, 82],
      [64, 66],
      [86, 52],
      [106, 44],
      [128, 42],
      [148, 48],
    ];
    const field = [
      [16, 38],
      [58, 22],
      [80, 110],
      [40, 56],
      [112, 90],
      [140, 22],
      [98, 18],
      [24, 128],
    ];
    const gid = `ca-nebula-${sid}`;
    return (
      <>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.08" />
          <stop
            offset="60%"
            stopColor="var(--accent-violet)"
            stopOpacity="0.03"
          />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <ellipse cx="85" cy="70" rx="50" ry="40" fill={`url(#${gid})`} />
        {/* Ecliptic arc. */}
        <path
          d="M -10 130 Q 80 20 170 40"
          stroke="var(--primary)"
          strokeOpacity="0.08"
          strokeWidth="1"
          fill="none"
        />
        {/* Graduation ticks. */}
        <g stroke="var(--accent-cyan)" strokeOpacity="0.12" strokeWidth="1">
          {ticks.map(([tx, ty], i) => (
            <line
              key={`tk-${i}`}
              x1={tx}
              y1={ty - (i % 2 === 0 ? 4 : 2)}
              x2={tx}
              y2={ty + (i % 2 === 0 ? 4 : 2)}
            />
          ))}
        </g>
        {/* Endpoint stars with halos. */}
        <circle
          cx="22"
          cy="108"
          r="8"
          fill="var(--accent-cyan)"
          fillOpacity="0.06"
        />
        <circle
          cx="22"
          cy="108"
          r="3"
          fill="var(--accent-cyan)"
          fillOpacity="0.55"
        />
        <circle
          cx="148"
          cy="48"
          r="10"
          fill="var(--foreground)"
          fillOpacity="0.07"
        />
        <circle
          cx="148"
          cy="48"
          r="4"
          fill="var(--foreground)"
          fillOpacity="0.65"
        />
        {field.map(([fx, fy], i) => (
          <Field key={`f-${i}`} x={fx} y={fy} ix={i} />
        ))}
      </>
    );
  },

  // 3 — Star cluster: a loose gathering of 7 stars of varying
  //     brightness, connected by a faint wisp of a nebula and
  //     a hairline tracing the brightest three.
  ({ t, sid }) => {
    const stars: [number, number, number, boolean][] = [
      [36, 84, 2.8, false],
      [52, 46, 3.5, true],
      [80, 28, 2.2, false],
      [68, 72, 2.0, false],
      [104, 92, 3.0, false],
      [128, 54, 2.5, false],
      [100, 120, 2.8, false],
    ];
    const field = [
      [18, 20],
      [44, 118],
      [120, 14],
      [146, 88],
      [24, 58],
      [88, 130],
      [142, 30],
      [56, 14],
    ];
    const trace = "M 52 46 L 36 84 L 104 92";
    const gid = `ca-nebula-${sid}`;
    return (
      <>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--accent-violet)"
            stopOpacity="0.1"
          />
          <stop
            offset="50%"
            stopColor="var(--accent-cyan)"
            stopOpacity="0.04"
          />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <ellipse cx="72" cy="68" rx="55" ry="45" fill={`url(#${gid})`} />
        {/* Faint arc wash. */}
        <path
          d="M -5 60 Q 75 0 160 50"
          stroke="var(--accent-cyan)"
          strokeOpacity="0.05"
          strokeWidth="1"
          fill="none"
        />
        {/* Hairline trace. */}
        <path
          d={trace}
          stroke="var(--primary)"
          strokeOpacity="0.18"
          strokeWidth="1.2"
          fill="none"
        />
        {/* Focal star halo. */}
        <circle
          cx="52"
          cy="46"
          r="10"
          fill="var(--foreground)"
          fillOpacity="0.07"
        />
        {/* Stars. */}
        {stars.map(([x, y, r, focal], i) => (
          <circle
            key={`sc-${i}`}
            cx={x}
            cy={y}
            r={r}
            fill={
              focal
                ? "var(--foreground)"
                : i % 3 === 0
                  ? "var(--accent-cyan)"
                  : "var(--accent-violet)"
            }
            fillOpacity={focal ? 0.7 : 0.4 + (i % 3) * 0.08}
          />
        ))}
        {field.map(([fx, fy], i) => (
          <Field key={`f-${i}`} x={fx} y={fy} ix={i} />
        ))}
      </>
    );
  },
];

/**
 * A tiny celestial decoration — one of several seed-stable variants —
 * rendered as a subdued inline SVG. Intended to fill incidental
 * whitespace at the bottom of a grid card when the card is stretched
 * taller than its text content.
 *
 * The `seed` prop (typically the item's `id`) deterministically picks
 * the variant and any sub-variation, so the same card always renders
 * the same decoration — no hydration mismatch, no randomness drift.
 */
export function CelestialArtifact({
  seed,
  className,
}: CelestialArtifactProps): React.ReactElement {
  const h = hashSeed(seed);
  const variantIdx = h % ARTIFACTS.length;
  const t = (h % 100) / 100; // sub-variation fraction 0…1 for angle/size tweaks
  const Variant = ARTIFACTS[variantIdx]!;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none mix-blend-screen", className)}
    >
      <svg viewBox="0 0 160 160" className="block size-20" fill="none">
        <defs>
          {/* Each variant defines its own radialGradient inside
           *  its render function so they share this <defs> slot
           *  without id collisions. */}
        </defs>
        <Variant t={t} sid={String(h)} />
      </svg>
    </div>
  );
}
