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

// jsdom does not implement `window.matchMedia`. Components that read it
// for a responsive default (e.g. the item-detail sidebar in
// DetailLayout) would throw on mount without this stub. It reports
// "does not match" by default — i.e. the mobile / narrow viewport —
// which keeps responsive-default tests deterministic. A test that needs
// the desktop branch can override `window.matchMedia` for its scope.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
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

// Node 24+ / non-jsdom environments may not expose Web Storage unless
// `--localstorage-file` is provided. Draft/timeline tests call
// `localStorage.clear()` in beforeEach; provide an in-memory shim.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = memoryStorage;
}
