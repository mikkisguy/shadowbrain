/** Rate-limit policy — per the App Security Baseline design spec
 *  §5. In-memory token-bucket per IP, applied by the proxy
 *  (`src/proxy.ts`):
 *
 *  - **Login** — strict, ≈5 attempts / 15 min / IP. The login route
 *    uses the same bucket as a defense-in-depth check.
 *  - **API** — gentle global limit, ≈120 req / min / IP, for every
 *    route under `/api/` other than `/api/auth/login` (which uses
 *    the stricter login bucket).
 *  - **Default** — broader limit, ≈600 req / min / IP, for every
 *    other (page) route.
 *
 *  The numbers are the spec's "approximately" values. The same
 *  bucket may also be used to derive a `Retry-After` header in
 *  seconds. The values are also exported individually for test
 *  assertions so a future change cannot drift away from the spec
 *  silently.
 */
export const RATE_LIMIT_LOGIN_MAX = 5;
export const RATE_LIMIT_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_API_MAX = 120;
export const RATE_LIMIT_API_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_DEFAULT_MAX = 600;
export const RATE_LIMIT_DEFAULT_WINDOW_MS = 60 * 1000;
