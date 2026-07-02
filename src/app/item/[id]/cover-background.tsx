/**
 * Full-bleed, fixed fading background for the item detail page.
 *
 * Rendered only when the item has a cover image (its first linked
 * image-type item, or its own `image_path` for an `image`-type item).
 * The photo is pinned to the viewport (`fixed`) behind the content
 * (`z-0`) with light / dark gradient overlays so the title, body, and
 * cards stay legible regardless of the photo. Mirrors the fading
 * treatment the old journal-shadows app used for journal entry cards.
 *
 * The page wraps the actual content in a `relative z-10` container so
 * it always paints above this background; this component is purely
 * presentational and server-rendered (no client behaviour).
 */
export interface CoverBackgroundProps {
  /** Ready-to-use image URL (`/api/images/…`). */
  imageUrl: string;
}

export function CoverBackground({ imageUrl }: CoverBackgroundProps) {
  return (
    <div
      aria-hidden
      data-testid="item-cover-background"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      {/* Strong scrim using the app's background color. The image is
          only subtly visible at the top — the overlay starts at ~40%
          opacity and builds quickly to near-opaque, matching the
          journal-shadows card treatment. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.95) 30%, rgba(10,10,10,0.98) 60%, rgba(10,10,10,1) 100%)",
        }}
      />
    </div>
  );
}
