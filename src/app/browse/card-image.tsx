"use client";

/**
 * Image rendering for a content card.
 *
 * Two visual treatments:
 * 1. **Background image** (non-image types) — an absolutely positioned `<img>`
 *    with a dark scrim gradient overlay, used as a card background
 * 2. **Image-type banner** — a 16:9 top banner for image-type items, with a
 *    fallback placeholder on error
 */

export function CardImage({
  imageUrl,
  isImageType,
  imageError,
  onImageError,
  hasCoverBg,
}: {
  imageUrl: string | null | undefined;
  isImageType: boolean;
  imageError: boolean;
  onImageError: () => void;
  hasCoverBg: boolean;
}) {
  return (
    <>
      {/* Cover image as a fading card background (non-image types). */}
      {hasCoverBg ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl!}
            alt=""
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            onError={onImageError}
            className="absolute inset-0 size-full object-cover"
            data-testid="content-card-bg-image"
          />
          {/* Strong scrim using the app's background color. The image
              is only subtly visible at the top — the overlay starts at
              ~40% opacity and builds quickly to near-opaque at the
              bottom, matching the journal-shadows card treatment. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.95) 30%, rgba(10,10,10,0.98) 60%, rgba(10,10,10,1) 100%)",
            }}
          />
        </div>
      ) : null}

      {/* Image-type cards render a top banner (16:9) above the body. */}
      {isImageType && imageUrl && !imageError ? (
        <div className="border-border bg-surface-muted pointer-events-none relative h-36 w-full overflow-hidden border-b">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            onError={onImageError}
            className="absolute inset-0 size-full object-cover brightness-50 transition-[filter] duration-200 group-hover:brightness-100"
            data-testid="content-card-image"
          />
        </div>
      ) : null}

      {/* Fallback for broken / missing images: a subtle placeholder
          so cards with and without images still feel like part of
          the same grid, rather than showing a browser broken-icon. */}
      {isImageType && imageUrl && imageError ? (
        <div
          className="border-border bg-surface-muted pointer-events-none flex h-36 w-full items-center justify-center border-b"
          data-testid="content-card-image-error"
        >
          <p className="text-muted-foreground font-sans text-xs">
            Image unavailable
          </p>
        </div>
      ) : null}
    </>
  );
}
