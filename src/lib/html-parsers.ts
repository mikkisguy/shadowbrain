// Pure HTML parsing helpers for bookmark metadata extraction.
// No external dependencies — all functions are synchronous string/RegExp
// utilities.

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  // Common named entities found in <title> and <meta> attributes.
  "&copy;": "\u00a9",
  "&reg;": "\u00ae",
  "&trade;": "\u2122",
  "&hellip;": "\u2026",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201c",
  "&rdquo;": "\u201d",
  "&middot;": "\u00b7",
  "&bull;": "\u2022",
  "&laquo;": "\u00ab",
  "&raquo;": "\u00bb",
  "&iexcl;": "\u00a1",
  "&iquest;": "\u00bf",
  "&deg;": "\u00b0",
  "&times;": "\u00d7",
  "&divide;": "\u00f7",
  "&euro;": "\u20ac",
  "&pound;": "\u00a3",
  "&cent;": "\u00a2",
  "&yen;": "\u00a5",
  "&sect;": "\u00a7",
  "&para;": "\u00b6",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function codePointFromInt(code: number, fallback: string): string {
  // Reject control characters and unassigned code points — they would
  // be replaced with U+FFFD or render as junk in the UI.
  if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
    return fallback;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function decodeEntities(s: string): string {
  // Decode named entities and numeric entities (decimal + hex) that
  // commonly appear in <title> and <meta content>. We keep the
  // decoder narrow on purpose: a full HTML entity table would balloon
  // the bundle for a string we only display back to the user. The
  // decoded strings are stored in JSON and rendered as text by the
  // web UI, so XSS is not a concern here — the goal is "looks right",
  // not "byte-for-byte lossless".
  return s.replace(
    /&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi,
    (m, name, dec, hex) => {
      if (name) return HTML_ENTITIES[`&${name};`] ?? m;
      if (dec) {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? codePointFromInt(code, m) : m;
      }
      if (hex) {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? codePointFromInt(code, m) : m;
      }
      return m;
    }
  );
}

function matchMeta(html: string, property: string): string | null {
  // Match `<meta property="og:title" content="..." />` in any quoting
  // style and across line breaks. Property and content can be in either
  // order; we look for both. Some publishers (notably Twitter) use
  // `name="twitter:*"` instead of `property="twitter:*"`, so we accept
  // either attribute for the key — content order is also free.
  const escaped = escapeRegex(property);
  const patterns: RegExp[] = [
    new RegExp(
      `<meta\\s+[^>]*property\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*property\\s*=\\s*["']${escaped}["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*name\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*name\\s*=\\s*["']${escaped}["']`,
      "i"
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decodeEntities(m[1]!);
  }
  return null;
}

function matchMetaName(html: string, name: string): string | null {
  const escaped = escapeRegex(name);
  const patterns: RegExp[] = [
    new RegExp(
      `<meta\\s+[^>]*name\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*name\\s*=\\s*["']${escaped}["']`,
      "i"
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decodeEntities(m[1]!);
  }
  return null;
}

function matchTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1]!.trim());
}

function resolveFavicon(html: string, base: URL): string | null {
  const linkRel = (rel: string): string | null => {
    const escaped = escapeRegex(rel);
    const re = new RegExp(
      `<link\\s+[^>]*rel\\s*=\\s*["']${escaped}["'][^>]*href\\s*=\\s*["']([^"']*)["']`,
      "i"
    );
    const m = html.match(re);
    return m ? m[1]! : null;
  };

  const href =
    linkRel("apple-touch-icon") ??
    linkRel("icon") ??
    linkRel("shortcut icon") ??
    "/favicon.ico";
  return safeAbsolute(href, base);
}

function safeAbsolute(href: string, base: URL): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function pickFirst(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v && v.trim().length > 0) return v;
  }
  return null;
}

export {
  matchMeta,
  matchMetaName,
  matchTitle,
  pickFirst,
  resolveFavicon,
  safeAbsolute,
};
