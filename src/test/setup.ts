/**
 * Global test setup.
 *
 * Runs before every test file. Currently:
 *
 *   - registers the `@testing-library/jest-dom` matchers
 *     (`toBeInTheDocument`, `toHaveTextContent`, …) so
 *     client-component tests can use them. Server-side
 *     tests are unaffected — the matchers are no-ops
 *     outside jsdom environments.
 *   - polyfills `ResizeObserver` (used by `cmdk` to size
 *     the list as the user types). jsdom does not ship
 *     a ResizeObserver implementation; the polyfill below
 *     is a no-op stub that returns the minimum API cmdk
 *     touches. Tests that depend on actual layout never
 *     run (jsdom is not a layout engine), so the empty
 *     implementation is fine.
 */
import "@testing-library/jest-dom/vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverPolyfill {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverPolyfill;
}

// `cmdk` calls `Element.prototype.scrollIntoView` to keep
// the keyboard-selected item in view. jsdom does not
// implement scroll/layout, so we polyfill it as a no-op
// (the keyboard navigation still works; the scroll is
// only cosmetic).
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function scrollIntoViewPolyfill() {
    /* no-op — jsdom has no layout */
  };
}
