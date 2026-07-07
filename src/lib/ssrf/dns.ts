import { LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";
import { log } from "../logger";
import { BLOCKED_IP, DNS_RESOLUTION_FAILED, DNS_TIMEOUT } from "./constants";
import { isPrivateOrLoopbackIp } from "./ip-ranges";

// ---------- Types ----------

/** A DNS lookup result. */
export interface HostRecord {
  ip: string;
  family: number; // 4 or 6
}

// ---------- DNS resolution with timeout ----------

/** Default DNS resolver using node:dns/promises. */
export async function defaultResolve(hostname: string): Promise<HostRecord[]> {
  // `lookup` with `all: true` returns every address, not just the
  // first — we must check every one. A hostname with both a public and
  // a private record is still unsafe. Map to our `HostRecord` shape
  // (the dns module uses `address`; the rest of the code uses `ip`).
  const records = await lookup(hostname, { all: true });
  return records.map((r: { address: string; family: number }) => ({
    ip: r.address,
    family: r.family,
  }));
}

/**
 * Wrap a resolve call with a timeout. `node:dns` does not accept an
 * AbortSignal, so we race against a `setTimeout`. The resolve is not
 * actually cancelled (libuv has no portable cancel hook), but the
 * caller bails out — keeping the response time bounded.
 */
export function resolveWithTimeout(
  hostname: string,
  resolve: (hostname: string) => Promise<HostRecord[]>,
  timeoutMs: number
): Promise<HostRecord[]> {
  return new Promise((resolveP, rejectP) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      rejectP(new Error(DNS_TIMEOUT));
    }, timeoutMs);
    resolve(hostname).then(
      (recs) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolveP(recs);
      },
      (err: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        rejectP(err);
      }
    );
  });
}

// ---------- Connect-time (DNS rebinding) guard ----------

/**
 * Build a `LookupFunction` that re-resolves the hostname at connect time
 * and re-validates every resolved IP. This closes the DNS rebinding
 * window between the initial validation and the actual connection.
 *
 * The returned function handles both `options.all === true` (returns all
 * addresses) and the single-address mode. When the caller does not request
 * all addresses, IPv4 is preferred over IPv6 for universal reachability.
 */
export function createSafeLookup(
  resolveBounded: (hostname: string) => Promise<HostRecord[]>
): LookupFunction {
  return ((
    lookupHostname: string,
    opts: number | { family?: number; hints?: number; all?: boolean },
    cb: (
      err: Error | null,
      addressOrAddresses: string | Array<{ address: string; family: number }>,
      family?: number
    ) => void
  ) => {
    resolveBounded(lookupHostname)
      .then((recs) => {
        if (recs.length === 0) {
          log("warn", "connect-time DNS returned no records", {
            event: "ssrf.dns.empty",
            hostname: lookupHostname,
          });
          cb(new Error(DNS_RESOLUTION_FAILED), "", 0);
          return;
        }
        for (const r of recs) {
          if (isPrivateOrLoopbackIp(r.ip)) {
            log("warn", "blocked DNS rebinding to private IP", {
              event: "ssrf.rebind.block",
              hostname: lookupHostname,
              ip: r.ip,
            });
            cb(new Error(BLOCKED_IP), "", 0);
            return;
          }
        }
        // Check if caller wants all addresses (options.all === true)
        const allMode = typeof opts === "object" && opts.all === true;
        if (allMode) {
          // Return all addresses in the array format
          cb(
            null,
            recs.map((r) => ({ address: r.ip, family: r.family }))
          );
        } else {
          // Prefer IPv4 results regardless of the caller's family
          // preference — IPv4 is universally reachable and avoids the
          // rare case where the remote has a misconfigured AAAA.
          const v4 = recs.find((r) => r.family === 4);
          const chosen = v4 ?? recs[0]!;
          cb(null, chosen.ip, chosen.family);
        }
      })
      .catch((err: unknown) => {
        cb(err instanceof Error ? err : new Error(String(err)), "", 0);
      });
  }) as LookupFunction;
}
