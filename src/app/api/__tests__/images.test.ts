import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { GET } from "@/app/api/images/[...path]/route";
import { getImagesDir } from "@/lib/storage";
import {
  authedGet,
  authedRequest,
  cleanupTestDb,
  createTestDb,
} from "@/db/test-utils";

// ── Mock setup for POST /api/images tests ──────────────────────────
// These mocks are hoisted by vitest above all imports.

const mockGetEnv = vi.hoisted(() => {
  const base = {
    NODE_ENV: "test" as const,
    DATA_DIR: "./data",
    SESSION_SECRET:
      "test-secret-that-is-at-least-32-characters-long-for-vitest",
    MAX_UPLOAD_SIZE_MB: 10,
  };
  const fn = vi.fn(() => base);
  return fn;
});

const mockProcessImage = vi.hoisted(() => vi.fn());
const mockDownloadImage = vi.hoisted(() => vi.fn());
const mockValidateImageMime = vi.hoisted(() => vi.fn());
const mockValidateFetchUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ getEnv: mockGetEnv }));
vi.mock("@/lib/image-processing", () => ({
  processImage: mockProcessImage,
  downloadImage: mockDownloadImage,
  validateImageMime: mockValidateImageMime,
  sanitizeFilename: vi.fn((name: string) => name),
}));
vi.mock("@/lib/ssrf", () => ({
  validateFetchUrl: mockValidateFetchUrl,
  BLOCKED_IP: "blocked IP",
  DISALLOWED_SCHEME: "disallowed scheme",
  INVALID_URL: "invalid URL",
  DNS_RESOLUTION_FAILED: "DNS resolution failed",
  DNS_TIMEOUT: "DNS timeout",
}));

import { POST } from "@/app/api/images/route";

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
  return GET(
    await authedGet("http://localhost/api/images/" + segments.join("/")),
    {
      params: Promise.resolve({ path: segments }),
    }
  );
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
    const res = await GET(await authedGet("http://localhost/api/images/etc"), {
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

// ── POST /api/images ────────────────────────────────────────────────

describe("POST /api/images", () => {
  beforeEach(() => {
    // Reset database
    cleanupTestDb();
    createTestDb().close();

    // Reset all mocks to defaults
    mockGetEnv.mockReturnValue({
      NODE_ENV: "test" as const,
      DATA_DIR: "./data",
      SESSION_SECRET:
        "test-secret-that-is-at-least-32-characters-long-for-vitest",
      MAX_UPLOAD_SIZE_MB: 10,
    });

    mockProcessImage.mockReset();
    mockProcessImage.mockImplementation(
      (_buffer: Buffer, originalFilename: string) =>
        Promise.resolve({
          imagePath: "2026-07/test.webp",
          metadata: {
            original_filename: originalFilename,
            width: 100,
            height: 100,
            format: "webp",
            size_bytes: 1234,
          },
        })
    );

    mockDownloadImage.mockReset();
    mockDownloadImage.mockResolvedValue({
      buffer: Buffer.from("fake-image-bytes"),
      contentType: "image/png",
    });

    mockValidateImageMime.mockReset();
    mockValidateImageMime.mockImplementation((mime: string) =>
      [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/tiff",
        "image/gif",
      ].includes(mime)
    );

    mockValidateFetchUrl.mockReset();
    mockValidateFetchUrl.mockResolvedValue({ ok: true, safeLookup: vi.fn() });
  });

  afterEach(() => {
    cleanupTestDb();
  });

  // ── File upload tests ─────────────────────────────────────────

  it("creates an image item from form data (201)", async () => {
    const fd = new FormData();
    fd.append("file", new File(["fake"], "test.png", { type: "image/png" }));

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.type).toBe("image");
    expect(json.image_path).toBe("2026-07/test.webp");
    expect(json.content).toBe("Image"); // fallback when no title/content
    expect(json.metadata).toBeDefined();
    const meta = JSON.parse(json.metadata);
    expect(meta.original_filename).toBe("test.png");
    expect(meta.captured_at).toBeDefined();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
    expect(meta.format).toBe("webp");
    expect(meta.size_bytes).toBe(1234);
    expect(mockProcessImage).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when not authenticated", async () => {
    const fd = new FormData();
    fd.append("file", new File(["fake"], "test.png", { type: "image/png" }));

    // No cookie — plain Request
    const req = new Request("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when no file provided", async () => {
    const fd = new FormData();
    // No 'file' field appended

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when file exceeds size limit", async () => {
    // Override MAX_UPLOAD_SIZE_MB so even a tiny buffer exceeds the limit
    mockGetEnv.mockReturnValue({
      NODE_ENV: "test" as const,
      DATA_DIR: "./data",
      SESSION_SECRET:
        "test-secret-that-is-at-least-32-characters-long-for-vitest",
      MAX_UPLOAD_SIZE_MB: 0,
    });

    const fd = new FormData();
    fd.append("file", new File(["fake"], "test.png", { type: "image/png" }));

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("exceeds maximum size");
  });

  it("returns 400 when file is empty (0 bytes)", async () => {
    const fd = new FormData();
    fd.append("file", new File([], "empty.png", { type: "image/png" }));

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("empty");
  });

  it("returns 400 for unsupported file type", async () => {
    mockValidateImageMime.mockReturnValue(false);

    const fd = new FormData();
    fd.append("file", new File(["fake"], "file.bmp", { type: "image/bmp" }));

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Unsupported image format");
  });

  it("returns 400 when image processing fails (corrupt image)", async () => {
    mockProcessImage.mockRejectedValue(new Error("sharp: invalid image"));

    const fd = new FormData();
    fd.append(
      "file",
      new File(["garbage"], "corrupt.png", { type: "image/png" })
    );

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("corrupt");
  });

  it("includes optional title and content in the created item", async () => {
    const fd = new FormData();
    fd.append("file", new File(["fake"], "test.png", { type: "image/png" }));
    fd.append("title", "My Photo");
    fd.append("content", "A beautiful sunset");

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.type).toBe("image");
    expect(json.title).toBe("My Photo");
    expect(json.content).toBe("A beautiful sunset");
    expect(json.image_path).toBe("2026-07/test.webp");

    const meta = JSON.parse(json.metadata);
    expect(meta.original_filename).toBe("test.png");
    expect(mockProcessImage).toHaveBeenCalledTimes(1);
  });

  it("verifies item has type image, image_path set, metadata with original_filename", async () => {
    const fd = new FormData();
    fd.append("file", new File(["fake"], "photo.jpg", { type: "image/jpeg" }));

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    // type assertion
    expect(json.type).toBe("image");
    expect(json.image_path).toBe("2026-07/test.webp");
    expect(json.source).toBe("web");
    expect(json.is_private).toBe(0);
    expect(json.is_hidden).toBe(0);

    const meta = JSON.parse(json.metadata);
    expect(meta.original_filename).toBe("photo.jpg");
    expect(meta.captured_at).toBeDefined();
  });

  // ── URL upload tests ──────────────────────────────────────────

  it("creates an image item from URL (201)", async () => {
    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/photo.png" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.type).toBe("image");
    expect(json.image_path).toBe("2026-07/test.webp");
    expect(json.content).toBe("Image");

    const meta = JSON.parse(json.metadata);
    expect(meta.original_filename).toBe("photo.png");
    expect(meta.captured_at).toBeDefined();

    expect(mockValidateFetchUrl).toHaveBeenCalledWith(
      "https://example.com/photo.png"
    );
    expect(mockDownloadImage).toHaveBeenCalledWith(
      "https://example.com/photo.png",
      expect.any(Function)
    );
    expect(mockProcessImage).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when no URL in body", async () => {
    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for SSRF-blocked URLs (BLOCKED_IP)", async () => {
    mockValidateFetchUrl.mockResolvedValue({
      ok: false,
      reason: "blocked IP",
    });

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://192.168.1.1/image.png" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("blocked IP");
  });

  it("returns 400 for SSRF-blocked URLs (DISALLOWED_SCHEME)", async () => {
    mockValidateFetchUrl.mockResolvedValue({
      ok: false,
      reason: "disallowed scheme",
    });

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "file:///etc/passwd" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("disallowed scheme");
  });

  it("returns 400 for SSRF-blocked URLs (INVALID_URL)", async () => {
    mockValidateFetchUrl.mockResolvedValue({
      ok: false,
      reason: "invalid URL",
    });

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("invalid URL");
  });

  it("returns 502 when DNS resolution fails", async () => {
    mockValidateFetchUrl.mockResolvedValue({
      ok: false,
      reason: "DNS resolution failed",
    });

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://nonexistent.example/image.png" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("DNS resolution failed");
  });

  it("returns 504 when DNS resolution times out", async () => {
    mockValidateFetchUrl.mockResolvedValue({
      ok: false,
      reason: "DNS timeout",
    });

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://slow-dns.example/image.png" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("DNS timeout");
  });

  it("returns 502 when download fails", async () => {
    mockDownloadImage.mockRejectedValue(new Error("HTTP 404"));

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/missing.png" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Failed to download image");
  });

  it("returns 400 for unsupported content type from URL", async () => {
    mockDownloadImage.mockResolvedValue({
      buffer: Buffer.from("some text"),
      contentType: "text/html",
    });
    mockValidateImageMime.mockImplementation((mime: string) =>
      [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/tiff",
        "image/gif",
      ].includes(mime)
    );

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/page.html" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain(
      "not point to a supported image format"
    );
  });

  it("returns 400 when image processing fails on downloaded image", async () => {
    mockProcessImage.mockRejectedValue(new Error("sharp: corrupt image"));

    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/corrupt.png" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("corrupt");
  });

  it("returns 400 when Content-Type is neither multipart nor JSON", async () => {
    const req = await authedRequest("http://localhost/api/images", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Content-Type");
  });
});
