import Link from "next/link";

/**
 * Brand mark for the top nav.
 *
 * Uses the project logo from `/public/logo.png` — a 1024×1024
 * network-mesh brain mark with a built-in cool-spectrum glow halo
 * (cyan → blue → violet on transparent). The mark carries its own
 * depth, so no card frame is needed around it.
 *
 * Sizing: 32×32 (h-8 / w-8), a small bump from the previous
 * icon-in-frame at 28×28 so the mark reads cleanly at the smaller
 * display size. The link's tappable hit area is 44×44
 * (min-h-11 / min-w-11) for touch; the visible logo stays 32×32.
 *
 * The link's accessible name still resolves to "ShadowBrain — home"
 * for assistive tech, even though the wordmark is no longer
 * rendered.
 */
export function Brand() {
  return (
    <Link
      href="/"
      aria-label="ShadowBrain — home"
      className="focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-11 min-w-11 items-center justify-center outline-none focus-visible:ring-1 focus-visible:ring-offset-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the
          /public asset is intentionally served as-is for now; if
          we need a smaller variant, we can switch to next/image. */}
      <img
        src="/logo.png"
        alt=""
        width={32}
        height={32}
        decoding="async"
        className="block size-8"
      />
    </Link>
  );
}
