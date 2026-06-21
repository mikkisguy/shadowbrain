/// <reference types="@testing-library/jest-dom/vitest" />

/**
 * Global type augmentations for the test environment.
 *
 * `@testing-library/jest-dom` augments vitest's `Assertion` and
 * `AsymmetricMatchersContaining` interfaces so the matchers
 * (`toBeInTheDocument`, `toHaveTextContent`, …) are visible to
 * TypeScript. The runtime import lives in `src/test/setup.ts`
 * (so vitest picks it up via the `setupFiles` config); this
 * file is the type-only counterpart that makes the augmentation
 * available during `tsc --noEmit`.
 */
export {};
