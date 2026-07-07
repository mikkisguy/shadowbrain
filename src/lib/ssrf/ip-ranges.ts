import { isIPv4, isIPv6 } from "node:net";

// ---------- IP range checking ----------

/**
 * Normalize an IP string before range-checking. Handles three cases
 * that the raw input may arrive in:
 *  1. URL hostnames: `https://[::1]/` → `[::1]` (brackets included).
 *  2. IPv4-mapped IPv6 in dotted form: `::ffff:8.8.8.8` (returned by
 *     `dns.lookup` on most Linux/macOS systems when an IPv4 connection
 *     is established from a dual-stack socket).
 *  3. IPv4-mapped IPv6 in hex form: `::ffff:808:808` (produced by the
 *     WHATWG URL parser when given `https://[::ffff:8.8.8.8]/`).
 *
 * The normalizer extracts the embedded IPv4 where possible, falling
 * back to the literal IPv6 form. The IPv4 is then range-checked by
 * `isPrivateIpv4`; the IPv6 by `isPrivateIpv6`.
 */
function normalizeIp(ip: string): string {
  let lower = ip.toLowerCase();
  // Strip brackets that the URL parser leaves on IPv6 hosts.
  if (lower.startsWith("[") && lower.endsWith("]")) {
    lower = lower.slice(1, -1);
  }
  // IPv4-mapped IPv6, dotted form: ::ffff:a.b.c.d
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1]!;
  // IPv4-mapped IPv6, hex form (URL-parser output): ::ffff:HHHH:HHHH
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    if (
      !Number.isNaN(hi) &&
      !Number.isNaN(lo) &&
      hi <= 0xffff &&
      lo <= 0xffff
    ) {
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }
  return lower;
}

/**
 * Return true when the IP is in a private / loopback / link-local range
 * that should never be reached from a public-internet fetcher.
 * Covers IPv4 and IPv6. Anything that doesn't parse as a valid IP is
 * treated as unsafe (the conservative default).
 */
export function isPrivateOrLoopbackIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (isIPv4(normalized)) return isPrivateIpv4(normalized);
  if (isIPv6(normalized)) return isPrivateIpv6(normalized);
  return true; // unknown format
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, includes cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // 224.0.0.0/4 (multicast) + 240/4 (reserved) + 255.255.255.255
  return false;
}

/**
 * IPv6 private/loopback/link-local range check.
 *
 * Covers (CIDR → first-group integer range, in standard notation):
 *  - `::1/128`        loopback                  (`::1`)
 *  - `::/128`         unspecified               (`::`)
 *  - `fc00::/7`       unique-local (ULA)        first group in `[0xfc00, 0xfdff]`
 *  - `fe80::/10`      link-local                first group in `[0xfe80, 0xfebf]`
 *  - `ff00::/8`       multicast                 first group in `[0xff00, 0xffff]`
 *
 * The CIDRs are checked against the **first** colon-separated group as
 * an integer so the `fe80::/10` range (which spans `fe80:`–`febf:`) is
 * caught — a string-prefix check on `"fe80:"` would miss `fe81::1`,
 * `fe9f::1`, `febf::1`, etc. and would let a link-local SSRF bypass
 * through. See issue #60 review for the bug that was caught.
 */
function isPrivateIpv6(ip: string): boolean {
  if (ip === "::1") return true; // ::1/128 (loopback)
  if (ip === "::") return true; // ::/128 (unspecified)
  // Expanded `::1` form: 8 groups, all zeros except the last which is 1.
  // Node's `isIPv6` only accepts the canonical short form, so this
  // branch catches the full form (including zero-padded variants like
  // `00:00:00:00:00:00:00:01`) when `isPrivateOrLoopbackIp` is called
  // directly (e.g. with a `dns.lookup` result in expanded form).
  // Comparing as integers (parseInt → 0 / 1) catches the zero-padded
  // forms that a string `g === "0"` check would miss.
  const groups = ip.split(":");
  if (groups.length === 8) {
    const last = groups[7];
    if (
      groups.slice(0, 7).every((g) => parseInt(g, 16) === 0) &&
      last !== undefined &&
      parseInt(last, 16) === 1
    ) {
      return true;
    }
  }
  const firstGroup = ip.split(":", 1)[0];
  if (!firstGroup) return true; // empty / malformed — treat as unsafe
  const num = parseInt(firstGroup, 16);
  if (Number.isNaN(num)) return true; // non-hex first group — unsafe
  if (num >= 0xfc00 && num <= 0xfdff) return true; // fc00::/7 (ULA)
  if (num >= 0xfe80 && num <= 0xfebf) return true; // fe80::/10 (link-local)
  if (num >= 0xff00 && num <= 0xffff) return true; // ff00::/8 (multicast)
  return false;
}
