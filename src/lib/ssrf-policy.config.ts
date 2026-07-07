/** SSRF (Server-Side Request Forgery) protection policy — per the
 *  App Security Baseline design spec §7. All URL-fetch endpoints
 *  (bookmark auto-fetch, image capture) MUST use the `validateFetchUrl`
 *  helper from `src/lib/ssrf.ts` before making any HTTP request.
 *
 *  The validator blocks private / loopback / link-local IP ranges,
 *  rejects non-http(s) schemes, and returns a `safeLookup` callback
 *  that re-validates the IP at connect time to prevent DNS rebinding.
 *
 *  These values are exported as a single object so the policy is
 *  reviewed in one place and can be asserted in tests.
 */
export const SSRF_POLICY = {
  /** Default request timeout in milliseconds. Bounds the whole request. */
  defaultTimeoutMs: 5_000,
  /** Default DNS resolution timeout in milliseconds. */
  defaultDnsTimeoutMs: 3_000,
  /** Default response body cap in bytes. Reading more aborts the request. */
  defaultMaxBytes: 1_048_576, // 1 MiB
  /** Max redirect hops to follow. Each hop is re-validated. */
  maxRedirectHops: 3,
} as const;
