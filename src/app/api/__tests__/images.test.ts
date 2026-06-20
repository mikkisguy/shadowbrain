import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { GET } from "@/app/api/images/[...path]/route";
import { getImagesDir } from "@/lib/storage";

const FIXTURE_DIR = "test-fixtures-route";

// Trivial file contents. The route does not parse the bytes —
// it serves them verbatim with a content-type derived from the
// extension — so any payload is fine for these tests.
const FILES: Record<string, string> = {
  "alpha.webp": "RIFF-WEBP-BYTES",
  "beta.png": "PNG-BYTES",
  "gamma.jpg": "JPEG-BYTES",
  "zeta.jpeg": "JPEG-BYTES",
  "unknown.bin": "BINARY",
  "ALPHA2.WEBP": "RIFF-WEBP-UPPERCASE",
  // Formats explicitly NOT served by the route. They are written
  // to disk by the test so we can assert the read-side rejects
  // them (i.e. serves them as application/octet-stream).
  "rejected.gif": "GIF-BYTES",
  "rejected.svg": "<svg></svg>",
};

async function callGet(segments: string[]) {
  return GET(new Request("http://localhost/api/images/" + segments.join("/")), {
    params: Promise.resolve({ path: segments }),
  });
}

describe("GET /api/images/[...path]", () => {
  beforeAll(async () => {
    const dir = join(getImagesDir(), FIXTURE_DIR);
    await fs.mkdir(dir, { recursive: true });
    for (const [name, content] of Object.entries(FILES)) {
      await fs.writeFile(join(dir, name), content);
    }
  });

  afterAll(async () => {
    await fs.rm(join(getImagesDir(), FIXTURE_DIR), {
      recursive: true,
      force: true,
    });
  });

  it("serves a WebP file with the correct content-type", async () => {
    const res = await callGet([FIXTURE_DIR, "alpha.webp"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(await res.text()).toBe("RIFF-WEBP-BYTES");
  });

  it("serves a PNG file with the correct content-type", async () => {
    const res = await callGet([FIXTURE_DIR, "beta.png"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("serves a JPEG file (both .jpg and .jpeg)", async () => {
    const jpg = await callGet([FIXTURE_DIR, "gamma.jpg"]);
    expect(jpg.status).toBe(200);
    expect(jpg.headers.get("Content-Type")).toBe("image/jpeg");
    const jpeg = await callGet([FIXTURE_DIR, "zeta.jpeg"]);
    expect(jpeg.status).toBe(200);
    expect(jpeg.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("resolves the extension case-insensitively", async () => {
    const res = await callGet([FIXTURE_DIR, "ALPHA2.WEBP"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    const res = await callGet([FIXTURE_DIR, "unknown.bin"]);
    expect(res.status).toBe(200);
    // Deliberate fallback to avoid MIME-type confusion attacks
    // (e.g. an arbitrary binary being interpreted as HTML).
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("does not advertise image/gif (animated WebP is the path for motion)", async () => {
    // The capture pipeline (#2.6) is expected to convert GIFs to
    // animated WebP. If a `.gif` ever lands in the images dir
    // (e.g. via a manual copy), the route serves it as a generic
    // binary rather than letting the browser animate it.
    const res = await callGet([FIXTURE_DIR, "rejected.gif"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("does not advertise image/svg+xml (inline-script XSS surface)", async () => {
    // SVGs can carry executable <script> blocks. We refuse to
    // label them as SVG so the browser cannot render them inline.
    const res = await callGet([FIXTURE_DIR, "rejected.svg"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("sets a long-lived, immutable Cache-Control header", async () => {
    const res = await callGet([FIXTURE_DIR, "alpha.webp"]);
    const cc = res.headers.get("Cache-Control");
    expect(cc).toContain("max-age=31536000");
    expect(cc).toContain("immutable");
  });

  it("returns 404 for a missing file in an existing directory", async () => {
    const res = await callGet([FIXTURE_DIR, "nope.webp"]);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a missing directory", async () => {
    const res = await callGet(["no-such-dir", "image.webp"]);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a path-traversal attempt (.. segments)", async () => {
    const res = await callGet([FIXTURE_DIR, "..", "..", "etc", "passwd"]);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("BAD_REQUEST");
  });

  it("returns 400 for a traversal attempt embedded in a segment", async () => {
    // Next.js will URL-decode `%2F` into `/`, but a single segment
    // containing `..` followed by slashes is still a single
    // segment from the catch-all's perspective. The containment
    // check in getImageFullPath must catch it.
    const res = await callGet([`${FIXTURE_DIR}/../../etc/passwd`]);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an absolute path", async () => {
    // The route joins segments and rejects the result with
    // `path.isAbsolute`. A single segment that begins with `/`
    // simulates a URL-encoded absolute path
    // (e.g. `/api/images/%2Fetc%2Fpasswd` decodes to one segment
    // starting with `/`).
    const res = await GET(new Request("http://localhost/api/images/etc"), {
      params: Promise.resolve({ path: ["/etc/passwd"] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an overlong path", async () => {
    const longSegment = "a".repeat(500);
    const res = await callGet([FIXTURE_DIR, longSegment]);
    expect(res.status).toBe(400);
  });

  it("accepts a path at exactly MAX_PATH_LENGTH (200 chars)", async () => {
    // The MAX_PATH_LENGTH cap applies to the joined path. Use a
    // single 200-char segment so the joined length is exactly 200:
    // 200 > 200 is false → the length guard passes and the
    // missing-file lookup returns 404. The boundary is the value
    // just past the limit.
    const res = await callGet(["a".repeat(200)]);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a path at MAX_PATH_LENGTH + 1 (201 chars)", async () => {
    const res = await callGet(["a".repeat(201)]);
    expect(res.status).toBe(400);
  });

  it("returns generic 400 messages to the client for traversal", async () => {
    const res = await callGet(["..", "..", "..", "etc", "shadow"]);
    expect(res.status).toBe(400);
    const json = await res.json();
    // Generic message — never reveal filesystem paths in client
    // responses (App Security Baseline §Error Handling).
    expect(json.error.message).toBe("Invalid image path");
    expect(JSON.stringify(json)).not.toContain("shadow");
  });
});
