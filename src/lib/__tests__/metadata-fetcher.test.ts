import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import {
  extractFirstUrl,
  extractBookmarkMetadata,
  fetchBookmarkMetadata,
  isPrivateOrLoopbackIp,
  safeFetchHtml,
  type HostRecord,
  type UpstreamResponseLike,
} from "../metadata-fetcher";

// ---------- extractFirstUrl ----------

describe("extractFirstUrl", () => {
  it("returns null when content has no URL", () => {
    expect(extractFirstUrl("just some text, no links here")).toBeNull();
  });

  it("finds an http URL", () => {
    expect(extractFirstUrl("see http://example.com/path")).toBe(
      "http://example.com/path"
    );
  });

  it("finds an https URL", () => {
    expect(extractFirstUrl("bookmark this https://example.com")).toBe(
      "https://example.com"
    );
  });

  it("returns the first URL when content has several", () => {
    expect(
      extractFirstUrl("first https://a.example/ then https://b.example/")
    ).toBe("https://a.example/");
  });

  it("strips trailing punctuation from sentence boundaries", () => {
    expect(extractFirstUrl("see https://example.com, it is great.")).toBe(
      "https://example.com"
    );
    expect(extractFirstUrl("(https://example.com)")).toBe(
      "https://example.com"
    );
  });

  it("preserves balanced parentheses inside a URL", () => {
    // Wikipedia-style URL with parens — keep the closing paren since
    // there is a matching opener inside the URL.
    expect(extractFirstUrl("see https://en.wikipedia.org/wiki/Foo_(bar)")).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)"
    );
  });
});

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

// ---------- extractBookmarkMetadata ----------

describe("extractBookmarkMetadata", () => {
  it("pulls og:title and og:description", () => {
    const html = `<html><head>
      <meta property="og:title" content="Hello World" />
      <meta property="og:description" content="A page about things" />
    </head><body></body></html>`;
    const m = extractBookmarkMetadata(html, "https://example.com/x");
    expect(m.title).toBe("Hello World");
    expect(m.description).toBe("A page about things");
    expect(m.url).toBe("https://example.com/x");
  });

  it("falls back to twitter:* when og:* is missing", () => {
    const html = `<html><head>
      <meta name="twitter:title" content="Tweeted Title" />
      <meta name="twitter:description" content="Tweeted Desc" />
    </head></html>`;
    const m = extractBookmarkMetadata(html, "https://example.com");
    expect(m.title).toBe("Tweeted Title");
    expect(m.description).toBe("Tweeted Desc");
  });

  it("falls back to <title> when neither og: nor twitter: are present", () => {
    const html = `<html><head><title>Plain Title</title></head></html>`;
    expect(extractBookmarkMetadata(html, "https://example.com").title).toBe(
      "Plain Title"
    );
  });

  it("falls back to <meta name='description'> for the description", () => {
    const html = `<html><head>
      <meta name="description" content="Old-school description" />
    </head></html>`;
    const m = extractBookmarkMetadata(html, "https://example.com");
    expect(m.description).toBe("Old-school description");
  });

  it("resolves a relative favicon against the page URL", () => {
    const html = `<html><head>
      <link rel="icon" href="/static/favicon.png" />
    </head></html>`;
    expect(
      extractBookmarkMetadata(html, "https://example.com/page").favicon
    ).toBe("https://example.com/static/favicon.png");
  });

  it("prefers apple-touch-icon, then icon, then shortcut icon, then /favicon.ico", () => {
    const base = "https://example.com";
    expect(
      extractBookmarkMetadata(
        `<link rel="icon" href="/a.ico"><link rel="apple-touch-icon" href="/b.png">`,
        base
      ).favicon
    ).toBe("https://example.com/b.png");
    expect(
      extractBookmarkMetadata(`<link rel="icon" href="/a.ico">`, base).favicon
    ).toBe("https://example.com/a.ico");
    expect(
      extractBookmarkMetadata(`<link rel="shortcut icon" href="/a.ico">`, base)
        .favicon
    ).toBe("https://example.com/a.ico");
    expect(extractBookmarkMetadata(``, base).favicon).toBe(
      "https://example.com/favicon.ico"
    );
  });

  it("keeps an absolute favicon URL as-is", () => {
    const html = `<link rel="icon" href="https://cdn.example.com/f.ico" />`;
    expect(extractBookmarkMetadata(html, "https://example.com").favicon).toBe(
      "https://cdn.example.com/f.ico"
    );
  });

  it("decodes basic HTML entities in title and description", () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry" />
      <meta property="og:description" content="It&#39;s &quot;fun&quot;" />`;
    const m = extractBookmarkMetadata(html, "https://example.com");
    expect(m.title).toBe("Tom & Jerry");
    expect(m.description).toBe(`It's "fun"`);
  });

  it("decodes decimal and hex numeric entities", () => {
    const html = `<meta property="og:title" content="&#60;tag&#62; &#x27;hello&#x27;" />`;
    const m = extractBookmarkMetadata(html, "https://example.com");
    expect(m.title).toBe(`<tag> 'hello'`);
  });

  it("decodes common named entities (mdash, hellip, copy, etc.)", () => {
    const html = `<meta property="og:title" content="Wait&hellip; &mdash; done &copy; 2026" />`;
    const m = extractBookmarkMetadata(html, "https://example.com");
    expect(m.title).toBe(`Wait\u2026 \u2014 done \u00a9 2026`);
  });

  it("never throws on malformed HTML", () => {
    const m = extractBookmarkMetadata("<<<>>>", "https://example.com");
    expect(m.title).toBeNull();
    expect(m.description).toBeNull();
  });
});

// ---------- safeFetchHtml ----------

describe("safeFetchHtml", () => {
  const publicResolve = (hostname: string): Promise<HostRecord[]> => {
    if (hostname === "example.com") {
      return Promise.resolve([{ ip: "93.184.216.34", family: 4 }]);
    }
    return Promise.reject(new Error(`unexpected resolve ${hostname}`));
  };

  const makeFakeFetch =
    (
      handler: (_url: URL, _lookup: unknown) => UpstreamResponseLike
    ): NonNullable<Parameters<typeof safeFetchHtml>[1]>["fetchImpl"] =>
    async (url, opts) =>
      handler(url, opts.lookup);

  it("returns the HTML body on a 200 response", async () => {
    const html = "<html><title>OK</title></html>";
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fakeFetch = makeFakeFetch((_url) => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: readable(html),
    }));
    const result = await safeFetchHtml("https://example.com/page", {
      resolve: publicResolve,
      fetchImpl: fakeFetch,
    });
    expect(result).toBe(html);
  });

  it("rejects URLs with private IP literals", async () => {
    await expect(
      safeFetchHtml("https://127.0.0.1/page", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/blocked IP/);
  });

  it("rejects URLs that resolve to private IPs", async () => {
    await expect(
      safeFetchHtml("https://internal.example.com", {
        resolve: () => Promise.resolve([{ ip: "10.0.0.5", family: 4 }]),
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/blocked IP/);
  });

  it("rejects AWS / GCP metadata endpoint", async () => {
    await expect(
      safeFetchHtml("http://169.254.169.254/latest/meta-data", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/blocked IP/);
  });

  it("rejects non-http(s) schemes", async () => {
    await expect(
      safeFetchHtml("file:///etc/passwd", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/scheme/);
    await expect(
      safeFetchHtml("javascript:alert(1)", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/scheme/);
  });

  it("re-validates the resolved IP at connect time (DNS rebinding)", async () => {
    // Two-layer DNS rebinding defence:
    //  - Pre-resolve (called by `buildSafeLookup`) returns a public IP.
    //  - The connect-time `lookup` callback (called by Node's http
    //    module when it actually opens the socket) returns a private IP.
    // The pre-resolve pass must NOT short-circuit — the connect-time
    // check is what stops rebinding, and the test must prove that
    // check actually runs. If the lookup callback were never invoked,
    // the fake fetch would throw "fetch should not reach the network"
    // and the test would not see the SSRF rejection.
    let resolveCalls = 0;
    let lookupCallbackInvocations = 0;
    const rebindingResolve = (hostname: string): Promise<HostRecord[]> => {
      if (hostname !== "evil.example") {
        return Promise.reject(new Error(`unexpected resolve ${hostname}`));
      }
      resolveCalls++;
      // First call (pre-resolve) returns a public IP. Second call
      // (connect-time lookup) returns a private IP. This is the
      // classic DNS rebinding pattern: the resolver flips the answer
      // between the validation step and the connect step.
      if (resolveCalls === 1) {
        return Promise.resolve([{ ip: "93.184.216.34", family: 4 }]);
      }
      return Promise.resolve([{ ip: "10.0.0.5", family: 4 }]);
    };
    const fetchImpl = (
      _url: URL,
      opts: { timeoutMs: number; lookup: unknown }
    ): Promise<{
      statusCode: number;
      headers: Record<string, string>;
      body: import("node:stream").Readable;
    }> => {
      return new Promise((resolveP, rejectP) => {
        // Call the connect-time lookup callback synchronously to
        // simulate what Node does at connect time.
        const lookup = opts.lookup as (
          h: string,
          o: unknown,
          cb: (err: Error | null, address: string, family: number) => void
        ) => void;
        lookup("evil.example", {}, (err: Error | null) => {
          lookupCallbackInvocations++;
          if (err) {
            rejectP(new Error(err.message));
            return;
          }
          rejectP(new Error("fetch should not reach the network"));
        });
      });
    };
    await expect(
      safeFetchHtml("https://evil.example/page", {
        resolve: rebindingResolve,
        fetchImpl,
      })
    ).rejects.toThrow(/blocked IP/);
    // The pre-resolve and the connect-time callback must both have
    // been hit for the defence to be meaningful.
    expect(resolveCalls).toBeGreaterThanOrEqual(2);
    expect(lookupCallbackInvocations).toBe(1);
  });

  it("rejects IPv6 literal loopback URLs", async () => {
    await expect(
      safeFetchHtml("https://[::1]/page", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/blocked IP/);
  });

  it("rejects IPv6 literal link-local URLs", async () => {
    await expect(
      safeFetchHtml("https://[fe80::1]/", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/blocked IP/);
  });

  it("rejects IPv6 literal ULA URLs", async () => {
    await expect(
      safeFetchHtml("https://[fc00::1]/", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/blocked IP/);
  });

  it("rejects URLs with userinfo that embed a private IP", async () => {
    // https://safe-looking@127.0.0.1/ — the URL parser puts
    // `safe-looking` in userinfo and `127.0.0.1` in the host. The SSRF
    // guard must catch the host, not the userinfo.
    await expect(
      safeFetchHtml("https://safe-looking@127.0.0.1/", {
        resolve: publicResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
      })
    ).rejects.toThrow(/blocked IP/);
  });

  it("rejects redirects to private addresses", async () => {
    const fetchImpl = makeFakeFetch((url) => {
      if (url.pathname === "/start") {
        return {
          statusCode: 302,
          headers: { location: "https://internal.example/secret" },
          body: readable(""),
        };
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    const resolve = (h: string): Promise<HostRecord[]> => {
      if (h === "example.com")
        return Promise.resolve([{ ip: "93.184.216.34", family: 4 }]);
      if (h === "internal.example")
        return Promise.resolve([{ ip: "10.0.0.5", family: 4 }]);
      return Promise.reject(new Error(`unexpected resolve ${h}`));
    };
    await expect(
      safeFetchHtml("https://example.com/start", { resolve, fetchImpl })
    ).rejects.toThrow(/blocked IP/);
  });

  it("follows safe redirects (≤ MAX_REDIRECTS hops)", async () => {
    let n = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetchImpl = makeFakeFetch((_url) => {
      n++;
      if (n < 3) {
        return {
          statusCode: 302,
          headers: { location: "https://example.com/next" },
          body: readable(""),
        };
      }
      return {
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: readable(`<title>Final</title>`),
      };
    });
    const html = await safeFetchHtml("https://example.com/start", {
      resolve: publicResolve,
      fetchImpl,
    });
    expect(html).toContain("Final");
  });

  it("rejects redirect chains longer than MAX_REDIRECT_HOPS", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetchImpl = makeFakeFetch((_url) => ({
      statusCode: 302,
      headers: { location: "https://example.com/loop" },
      body: readable(""),
    }));
    await expect(
      safeFetchHtml("https://example.com/start", {
        resolve: publicResolve,
        fetchImpl,
      })
    ).rejects.toThrow(/too many redirects/);
  });

  it("waits for a genuinely-pending resolve to settle (regression: pre-resolve must not race with setTimeout(0))", async () => {
    // Earlier versions of `buildSafeLookup` passed `0` to
    // `resolveWithTimeout` for the pre-resolve path. Because
    // `setTimeout(0)` is a macrotask and a still-pending
    // `Promise.then` is a microtask, the timer won the race and the
    // pre-resolve always rejected with "DNS timeout" — even when the
    // underlying lookup would have succeeded a few ms later. This
    // test uses a real async delay to prove the pre-resolve actually
    // waits for the resolve call to settle instead of failing on the
    // very first event-loop tick.
    const slowResolve = (hostname: string): Promise<HostRecord[]> => {
      if (hostname !== "slow.example") {
        return Promise.reject(new Error(`unexpected resolve ${hostname}`));
      }
      return new Promise((r) => {
        setTimeout(() => r([{ ip: "93.184.216.34", family: 4 }]), 20);
      });
    };
    const html = await safeFetchHtml("https://slow.example/page", {
      resolve: slowResolve,
      fetchImpl: makeFakeFetch(() => ({
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: readable("<title>Slow but OK</title>"),
      })),
      dnsTimeoutMs: 3_000,
    });
    expect(html).toContain("Slow but OK");
  });

  it("times out a DNS resolve that takes longer than dnsTimeoutMs", async () => {
    const hangingResolve = (): Promise<HostRecord[]> =>
      new Promise(() => {
        /* never settles */
      });
    await expect(
      safeFetchHtml("https://hang.example/", {
        resolve: hangingResolve,
        fetchImpl: makeFakeFetch(() => {
          throw new Error("fetch must not be called");
        }),
        dnsTimeoutMs: 50,
      })
    ).rejects.toThrow(/DNS timeout/);
  });

  it("rejects non-HTML content types", async () => {
    const fetchImpl = makeFakeFetch(() => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: readable("{}"),
    }));
    await expect(
      safeFetchHtml("https://example.com/api", {
        resolve: publicResolve,
        fetchImpl,
      })
    ).rejects.toThrow(/non-HTML/);
  });

  it("rejects upstream non-2xx responses", async () => {
    const fetchImpl = makeFakeFetch(() => ({
      statusCode: 404,
      headers: { "content-type": "text/html" },
      body: readable("not found"),
    }));
    await expect(
      safeFetchHtml("https://example.com/missing", {
        resolve: publicResolve,
        fetchImpl,
      })
    ).rejects.toThrow(/upstream 404/);
  });

  it("rejects responses larger than the size cap", async () => {
    const big = "x".repeat(2048);
    const fetchImpl = makeFakeFetch(() => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: readable(big),
    }));
    await expect(
      safeFetchHtml("https://example.com/big", {
        resolve: publicResolve,
        fetchImpl,
        maxBytes: 1024,
      })
    ).rejects.toThrow(/too large/);
  });

  it("propagates a network error from the underlying fetch", async () => {
    const fetchImpl: NonNullable<
      Parameters<typeof safeFetchHtml>[1]
    >["fetchImpl"] = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(
      safeFetchHtml("https://example.com/", {
        resolve: publicResolve,
        fetchImpl,
      })
    ).rejects.toThrow(/network error/);
  });
});

// ---------- fetchBookmarkMetadata (top-level) ----------

describe("fetchBookmarkMetadata", () => {
  it("returns ok=false with empty url when content has no URL", async () => {
    const r = await fetchBookmarkMetadata("no link here", {
      resolve: () => Promise.resolve([]),
      fetchImpl: () => Promise.reject(new Error("must not fetch")),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/no url/);
    expect(r.metadata.url).toBe("");
  });

  it("returns ok=false (graceful) when the upstream fetch fails", async () => {
    const r = await fetchBookmarkMetadata("see https://example.com/x", {
      resolve: () => Promise.resolve([{ ip: "93.184.216.34", family: 4 }]),
      fetchImpl: async () => {
        throw new Error("upstream 503");
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/upstream 503/);
    expect(r.metadata.url).toBe("https://example.com/x");
  });

  it("returns ok=false (graceful) when the URL is blocked by SSRF guard", async () => {
    const r = await fetchBookmarkMetadata("see https://127.0.0.1/", {
      resolve: () => Promise.resolve([{ ip: "127.0.0.1", family: 4 }]),
      fetchImpl: () => Promise.reject(new Error("must not fetch")),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/blocked IP/);
    expect(r.metadata.url).toBe("https://127.0.0.1/");
  });

  it("returns full metadata on a successful fetch", async () => {
    const html = `<html><head>
      <meta property="og:title" content="Real Title" />
      <meta property="og:description" content="Real Desc" />
      <link rel="icon" href="/f.ico" />
    </head></html>`;
    const r = await fetchBookmarkMetadata("https://example.com/article", {
      resolve: () => Promise.resolve([{ ip: "93.184.216.34", family: 4 }]),
      fetchImpl: async () => ({
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: readable(html),
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.metadata.title).toBe("Real Title");
    expect(r.metadata.description).toBe("Real Desc");
    expect(r.metadata.favicon).toBe("https://example.com/f.ico");
    expect(r.metadata.url).toBe("https://example.com/article");
    expect(r.metadata.fetched_at).toMatch(/T.*Z$/);
  });
});

// ---------- helpers ----------

function readable(text: string): Readable {
  return Readable.from(Buffer.from(text, "utf-8"));
}
