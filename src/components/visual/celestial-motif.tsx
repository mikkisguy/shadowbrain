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

export { CelestialCluster } from "./celestial-cluster";
export { CelestialHeader } from "./celestial-header";
