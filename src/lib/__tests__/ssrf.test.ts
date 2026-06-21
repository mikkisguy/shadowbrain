import { describe, it, expect } from "vitest";
import {
  validateFetchUrl,
  isPrivateOrLoopbackIp,
  BLOCKED_IP,
  DNS_RESOLUTION_FAILED,
  DNS_TIMEOUT,
  DISALLOWED_SCHEME,
  INVALID_URL,
  type HostRecord,
} from "../ssrf";

// ---------- isPrivateOrLoopbackIp ----------

describe("isPrivateOrLoopbackIp", () => {
  it("blocks IPv4 loopback", () => {
    expect(isPrivateOrLoopbackIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("127.255.255.254")).toBe(true);
  });

  it("blocks the AWS / GCP metadata endpoint", () => {
    expect(isPrivateOrLoopbackIp("169.254.169.254")).toBe(true);
  });

  it("blocks RFC1918 ranges", () => {
    expect(isPrivateOrLoopbackIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("172.31.255.254")).toBe(true);
    expect(isPrivateOrLoopbackIp("192.168.1.1")).toBe(true);
  });

  it("blocks CGNAT 100.64.0.0/10", () => {
    expect(isPrivateOrLoopbackIp("100.64.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("100.127.255.254")).toBe(true);
  });

  it("blocks 0.0.0.0 and multicast / reserved", () => {
    expect(isPrivateOrLoopbackIp("0.0.0.0")).toBe(true);
    expect(isPrivateOrLoopbackIp("224.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("255.255.255.255")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateOrLoopbackIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrLoopbackIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrLoopbackIp("93.184.216.34")).toBe(false);
  });

  it("blocks IPv6 loopback and link-local", () => {
    expect(isPrivateOrLoopbackIp("::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fe80::1")).toBe(true);
  });

  it("blocks the full fe80::/10 link-local range (regression: fe80: prefix check missed fe81-febf)", () => {
    // fe80::/10 covers first-group addresses in [0xfe80, 0xfebf]. The
    // original implementation used `ip.startsWith("fe80:")` which only
    // caught fe80:: and missed the rest of the range. The review of
    // issue #60 caught this. These addresses must all be blocked.
    expect(isPrivateOrLoopbackIp("fe81::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fe8f::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fe9f::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fea0::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("feaf::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("febf::1")).toBe(true);
  });

  it("allows IPv6 addresses just outside fe80::/10 (fec0::)", () => {
    // fec0:: was the deprecated site-local prefix — outside fe80::/10
    // so not blocked by the link-local rule. (We don't add a separate
    // site-local block per the spec — fec0:: is reserved/unallocated
    // per RFC 3879 but the spec only lists the explicit ranges in §7.)
    expect(isPrivateOrLoopbackIp("fec0::1")).toBe(false);
  });

  it("blocks expanded ::1 form (0:0:0:0:0:0:0:1)", () => {
    // The URL parser normalises the expanded form to `::1` before the
    // validator sees it, so this is not a practical bypass — but the
    // function is also exported for direct use and should handle it.
    expect(isPrivateOrLoopbackIp("0:0:0:0:0:0:0:1")).toBe(true);
  });

  it("blocks zero-padded expanded ::1 form (00:…:01, 0000:…:0001)", () => {
    // `net.isIPv6` returns true for zero-padded expanded forms. The
    // string `g === "0"` check would miss these — the integer check
    // (parseInt === 0 / 1) catches them.
    expect(isPrivateOrLoopbackIp("00:00:00:00:00:00:00:01")).toBe(true);
    expect(
      isPrivateOrLoopbackIp("0000:0000:0000:0000:0000:0000:0000:0001")
    ).toBe(true);
  });

  it("does not false-positive on zero-padded non-loopback (0:0:0:0:0:0:0:2)", () => {
    // Same shape as the loopback expanded form, but the last group is
    // 2 — must NOT be flagged as loopback.
    expect(isPrivateOrLoopbackIp("0:0:0:0:0:0:0:2")).toBe(false);
    expect(isPrivateOrLoopbackIp("00:00:00:00:00:00:00:02")).toBe(false);
  });

  it("blocks IPv6 unique-local fc00::/7", () => {
    expect(isPrivateOrLoopbackIp("fc00::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fd00::1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses by applying IPv4 rules", () => {
    expect(isPrivateOrLoopbackIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("::ffff:10.0.0.1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 in hex form (URL-parser output)", () => {
    // `new URL("http://[::ffff:8.8.8.8]/").hostname` returns
    // `[::ffff:808:808]`. After bracket-stripping the normalizer sees
    // `::ffff:808:808` and reconstructs `8.8.8.8` for the IPv4 check.
    // This must NOT match the IPv4 range — 8.8.8.8 is public.
    expect(isPrivateOrLoopbackIp("::ffff:808:808")).toBe(false);
    expect(isPrivateOrLoopbackIp("::ffff:7f00:1")).toBe(true); // 127.0.0.1
    expect(isPrivateOrLoopbackIp("::ffff:a00:1")).toBe(true); // 10.0.0.1
  });

  it("strips URL-style brackets from IPv6 input", () => {
    // `new URL("http://[::1]/").hostname` returns `[::1]`. The
    // normalizer must strip brackets so the range check sees `::1`.
    expect(isPrivateOrLoopbackIp("[::1]")).toBe(true);
    expect(isPrivateOrLoopbackIp("[2606:4700:4700::1111]")).toBe(false);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateOrLoopbackIp("2606:4700:4700::1111")).toBe(false);
  });

  it("treats garbage as unsafe", () => {
    expect(isPrivateOrLoopbackIp("not-an-ip")).toBe(true);
  });
});

// ---------- validateFetchUrl ----------

describe("validateFetchUrl", () => {
  const publicResolve = (hostname: string): Promise<HostRecord[]> => {
    if (hostname === "example.com") {
      return Promise.resolve([{ ip: "93.184.216.34", family: 4 }]);
    }
    return Promise.reject(new Error(`unexpected resolve ${hostname}`));
  };

  it("returns ok=true with safeLookup for a valid public URL", async () => {
    const result = await validateFetchUrl("https://example.com/", {
      resolve: publicResolve,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url.href).toBe("https://example.com/");
    expect(typeof result.safeLookup).toBe("function");
  });

  it("rejects https://127.0.0.1/ (IP literal)", async () => {
    const result = await validateFetchUrl("https://127.0.0.1/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects http://169.254.169.254/latest/meta-data (cloud metadata)", async () => {
    const result = await validateFetchUrl(
      "http://169.254.169.254/latest/meta-data"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects http://10.0.0.5/", async () => {
    const result = await validateFetchUrl("http://10.0.0.5/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects http://[::1]/", async () => {
    const result = await validateFetchUrl("http://[::1]/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects http://[fe80::1]/", async () => {
    const result = await validateFetchUrl("http://[fe80::1]/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects http://[fe81::1]/ (full fe80::/10 range, not just fe80:)", async () => {
    // Regression: the original isPrivateIpv6 used `startsWith("fe80:")`
    // and would have allowed this. The @oracle review caught it.
    const result = await validateFetchUrl("http://[fe81::1]/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects http://[febf::1]/ (upper bound of fe80::/10)", async () => {
    const result = await validateFetchUrl("http://[febf::1]/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects http://[fc00::1]/", async () => {
    const result = await validateFetchUrl("http://[fc00::1]/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("rejects non-http(s) schemes: file:///", async () => {
    const result = await validateFetchUrl("file:///etc/passwd");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Generic reason — the scheme itself is not echoed in the
    // client-facing message (it is user-supplied).
    expect(result.reason).toBe(DISALLOWED_SCHEME);
  });

  it("rejects non-http(s) schemes: javascript:", async () => {
    const result = await validateFetchUrl("javascript:alert(1)");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(DISALLOWED_SCHEME);
  });

  it("rejects non-http(s) schemes: data:", async () => {
    const result = await validateFetchUrl("data:text/plain,foo");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(DISALLOWED_SCHEME);
  });

  it("rejects an unparseable URL string with INVALID_URL (defense-in-depth)", async () => {
    // `new URL` throws on malformed input. validateFetchUrl must catch
    // the throw and return a clean { ok: false, reason } — a future
    // caller (e.g. the image capture endpoint in #44) should never
    // see an unhandled exception escape this helper.
    const result = await validateFetchUrl("http://[::1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(INVALID_URL);
  });

  it("rejects a URL with an out-of-range port", async () => {
    // 99999 is not a valid TCP port — `new URL` throws.
    const result = await validateFetchUrl("http://127.0.0.1:99999/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(INVALID_URL);
  });

  it("rejects hostname that resolves to a private IP", async () => {
    const result = await validateFetchUrl("https://internal.example.com/", {
      resolve: () => Promise.resolve([{ ip: "10.0.0.5", family: 4 }]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  it("allows hostname that resolves to a public IP", async () => {
    const result = await validateFetchUrl("https://public.example.com/", {
      resolve: () => Promise.resolve([{ ip: "8.8.8.8", family: 4 }]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url.href).toBe("https://public.example.com/");
  });

  it("rejects hostname whose DNS returns no records", async () => {
    const result = await validateFetchUrl("https://nxdomain.example.com/", {
      resolve: () => Promise.resolve([]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(DNS_RESOLUTION_FAILED);
  });

  it("times out a hanging DNS resolve", async () => {
    const hangingResolve = (): Promise<HostRecord[]> =>
      new Promise(() => {
        /* never settles */
      });
    const result = await validateFetchUrl("https://hang.example.com/", {
      resolve: hangingResolve,
      dnsTimeoutMs: 50,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(DNS_TIMEOUT);
  });

  it("rejects URLs with userinfo that embed a private IP", async () => {
    // https://safe-looking@127.0.0.1/ — the URL parser puts
    // `safe-looking` in userinfo and `127.0.0.1` in the host. The SSRF
    // guard must catch the host, not the userinfo.
    const result = await validateFetchUrl("https://safe-looking@127.0.0.1/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(BLOCKED_IP);
  });

  // ---------- DNS rebinding test ----------
  it("DNS rebinding: safeLookup errors when connect-time resolve returns private IP", async () => {
    // The host resolves to public IP first (pre-validation), then
    // private IP at connect time (rebinding). The safeLookup callback
    // must detect this and error.
    let resolveCalls = 0;
    const rebindingResolve = (hostname: string): Promise<HostRecord[]> => {
      if (hostname !== "evil.example") {
        return Promise.reject(new Error(`unexpected resolve ${hostname}`));
      }
      resolveCalls++;
      // First call (pre-resolve) returns a public IP. Second call
      // (connect-time lookup) returns a private IP.
      if (resolveCalls === 1) {
        return Promise.resolve([{ ip: "93.184.216.34", family: 4 }]);
      }
      return Promise.resolve([{ ip: "10.0.0.5", family: 4 }]);
    };

    const result = await validateFetchUrl("https://evil.example/", {
      resolve: rebindingResolve,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Now invoke the safeLookup callback to simulate connect-time rebind.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookupResult = await new Promise<any>((resolveP) => {
      result.safeLookup("evil.example", {}, (err, address, family) => {
        if (err) {
          resolveP(err);
          return;
        }
        resolveP({ address, family });
      });
    });

    // The callback should have returned an error (blocked IP).
    expect(lookupResult).toBeInstanceOf(Error);
    expect((lookupResult as Error).message).toBe(BLOCKED_IP);

    // Both pre-resolve and connect-time should have been hit.
    expect(resolveCalls).toBeGreaterThanOrEqual(2);
  });

  // ---------- IP literal safeLookup ----------
  it("safeLookup for IP literal returns the same IP without re-resolving", async () => {
    const result = await validateFetchUrl("https://8.8.8.8/");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Invoke safeLookup for an IP literal — it should return the
    // same IP without DNS resolution.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookupResult = await new Promise<any>((resolveP) => {
      result.safeLookup("8.8.8.8", {}, (err, address, family) => {
        if (err) {
          resolveP(err);
          return;
        }
        resolveP({ address, family });
      });
    });

    expect(lookupResult).toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("safeLookup for IPv6 literal returns the same IP without re-resolving", async () => {
    const result = await validateFetchUrl("https://[2606:4700:4700::1111]/");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Invoke safeLookup for an IPv6 literal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookupResult = await new Promise<any>((resolveP) => {
      result.safeLookup("2606:4700:4700::1111", {}, (err, address, family) => {
        if (err) {
          resolveP(err);
          return;
        }
        resolveP({ address, family });
      });
    });

    expect(lookupResult).toEqual({
      address: "2606:4700:4700::1111",
      family: 6,
    });
  });

  it("safeLookup prefers IPv4 when both A and AAAA records exist", async () => {
    const result = await validateFetchUrl("https://dual.example.com/", {
      resolve: () =>
        Promise.resolve([
          { ip: "2606:4700:4700::1111", family: 6 },
          { ip: "93.184.216.34", family: 4 },
        ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookupResult = await new Promise<any>((resolveP) => {
      result.safeLookup("dual.example.com", {}, (err, address, family) => {
        if (err) {
          resolveP(err);
          return;
        }
        resolveP({ address, family });
      });
    });

    expect(lookupResult).toEqual({ address: "93.184.216.34", family: 4 });
  });
});
