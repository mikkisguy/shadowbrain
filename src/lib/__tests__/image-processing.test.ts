import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import type { Mock } from "vitest";
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import { join } from "path";
import os from "os";
import sharp from "sharp";
import {
  processImage,
  sanitizeFilename,
  validateImageMime,
  downloadImage,
} from "@/lib/image-processing";
import { getImagesDir } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Mock setup — downloadImage uses node:http/node:https, not fetch
// ---------------------------------------------------------------------------

const { mockHttpRequest, mockHttpsRequest } = vi.hoisted(() => ({
  mockHttpRequest: vi.fn(),
  mockHttpsRequest: vi.fn(),
}));

vi.mock("http", () => ({
  default: {
    request: mockHttpRequest,
  },
}));

vi.mock("https", () => ({
  default: {
    request: mockHttpsRequest,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockRequest extends EventEmitter {
  setTimeout: Mock;
  end: Mock;
  destroy: Mock;
}

interface MockResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
}

function createMockRequest(): MockRequest {
  const req = new EventEmitter() as MockRequest;
  req.setTimeout = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

function createMockResponse(
  statusCode: number,
  contentType?: string | null
): MockResponse {
  const res = new EventEmitter() as MockResponse;
  res.statusCode = statusCode;
  res.headers = {};
  if (contentType !== undefined && contentType !== null) {
    res.headers["content-type"] = contentType;
  }
  return res;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const TEST_DATA_DIR = join(os.tmpdir(), "shadowbrain-test-images");

beforeAll(() => {
  process.env.DATA_DIR = TEST_DATA_DIR;
});

afterAll(async () => {
  await fs.rm(getImagesDir(), { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe("sanitizeFilename", () => {
  it("returns basename only (strips path)", () => {
    expect(sanitizeFilename("/some/path/to/image.png")).toBe("image.png");
    expect(sanitizeFilename("../../malicious.com/evil.sh")).toBe("evil.sh");
  });

  it("replaces special characters with underscores", () => {
    expect(sanitizeFilename("hello world.jpg")).toBe("hello_world.jpg");
    expect(sanitizeFilename("foo:bar*baz?.gif")).toBe("foo_bar_baz_.gif");
    expect(sanitizeFilename("a<b>c|d.txt")).toBe("a_b_c_d.txt");
  });

  it("strips leading dots", () => {
    expect(sanitizeFilename("...hidden.png")).toBe("hidden.png");
    expect(sanitizeFilename(".dotfile")).toBe("dotfile");
  });

  it("collapses consecutive dots", () => {
    expect(sanitizeFilename("file...name..ext.png")).toBe("file.name.ext.png");
  });

  it("truncates long filenames while preserving extension", () => {
    const longName = "a".repeat(200) + ".jpeg";
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith(".jpeg")).toBe(true);
    // The base (without extension) is at most 120 - len(".jpeg") = 115 chars
    expect(result).toBe("a".repeat(115) + ".jpeg");
  });

  it("handles empty string by returning 'file'", () => {
    expect(sanitizeFilename("")).toBe("file");
  });

  it("handles a string with only special chars", () => {
    expect(sanitizeFilename("...///...")).toBe("file");
  });
});

// ---------------------------------------------------------------------------
// validateImageMime
// ---------------------------------------------------------------------------

describe("validateImageMime", () => {
  it("accepts image/jpeg", () => {
    expect(validateImageMime("image/jpeg")).toBe(true);
  });

  it("accepts image/png", () => {
    expect(validateImageMime("image/png")).toBe(true);
  });

  it("accepts image/webp", () => {
    expect(validateImageMime("image/webp")).toBe(true);
  });

  it("accepts image/avif", () => {
    expect(validateImageMime("image/avif")).toBe(true);
  });

  it("accepts image/tiff", () => {
    expect(validateImageMime("image/tiff")).toBe(true);
  });

  it("accepts image/gif", () => {
    expect(validateImageMime("image/gif")).toBe(true);
  });

  it("rejects text/html", () => {
    expect(validateImageMime("text/html")).toBe(false);
  });

  it("rejects application/octet-stream", () => {
    expect(validateImageMime("application/octet-stream")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateImageMime("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processImage
// ---------------------------------------------------------------------------

describe("processImage", () => {
  let result: Awaited<ReturnType<typeof processImage>>;
  let originalFilename: string;

  beforeAll(async () => {
    // Create a 1×1 red PNG
    const buffer = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    originalFilename = "test-image.png";
    result = await processImage(buffer, originalFilename);
  });

  it("returns an imagePath matching YYYY-MM/uuid.webp", () => {
    expect(result.imagePath).toMatch(/^\d{4}-\d{2}\/[a-f0-9-]+\.webp$/);
  });

  it("creates a .webp file at the expected path on disk", async () => {
    const fullPath = join(getImagesDir(), result.imagePath);
    await expect(fs.stat(fullPath)).resolves.toBeDefined();
  });

  it("the written file is a valid WebP image", async () => {
    const fullPath = join(getImagesDir(), result.imagePath);
    const fileBuffer = await fs.readFile(fullPath);
    const meta = await sharp(fileBuffer).metadata();
    expect(meta.format).toBe("webp");
  });

  it("returns metadata with correct fields", () => {
    expect(result.metadata.original_filename).toBe(
      sanitizeFilename(originalFilename)
    );
    expect(result.metadata.width).toBe(1);
    expect(result.metadata.height).toBe(1);
    expect(result.metadata.format).toBe("webp");
    expect(result.metadata.size_bytes).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// downloadImage
// ---------------------------------------------------------------------------

describe("downloadImage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns { buffer, contentType } on success", async () => {
    const req = createMockRequest();
    const res = createMockResponse(200, "image/png");
    const data = Buffer.from("fake-image-data");

    mockHttpsRequest.mockImplementation((_options, callback) => {
      process.nextTick(() => {
        callback(res);
        res.emit("data", data);
        res.emit("end");
      });
      return req;
    });

    const result = await downloadImage("https://example.com/photo.png");
    expect(result).toHaveProperty("buffer");
    expect(result).toHaveProperty("contentType");
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.contentType).toBe("image/png");
  });

  it("throws on non-OK HTTP response", async () => {
    const req = createMockRequest();
    const res = createMockResponse(404);

    mockHttpsRequest.mockImplementation((_options, callback) => {
      process.nextTick(() => {
        callback(res);
        res.emit("end");
      });
      return req;
    });

    await expect(
      downloadImage("https://example.com/missing.png")
    ).rejects.toThrow(/HTTP 404/);
  });

  it("throws on server error", async () => {
    const req = createMockRequest();
    const res = createMockResponse(500);

    mockHttpsRequest.mockImplementation((_options, callback) => {
      process.nextTick(() => {
        callback(res);
        res.emit("end");
      });
      return req;
    });

    await expect(
      downloadImage("https://example.com/error.png")
    ).rejects.toThrow(/HTTP 500/);
  });

  it("aborts the request after 30 seconds on a hanging connection", async () => {
    const req = createMockRequest();

    // Capture the timeout callback instead of using a simple mock
    let timeoutCallback: (() => void) | undefined;
    req.setTimeout = vi.fn((_ms: number, cb: () => void) => {
      timeoutCallback = cb;
    });

    // Never emit any response — simulate a hanging connection
    mockHttpsRequest.mockImplementation(() => req);

    const promise = downloadImage("https://example.com/hangs");

    // Trigger the timeout manually
    expect(timeoutCallback).toBeDefined();
    timeoutCallback!();

    await expect(promise).rejects.toThrow("Request timeout");
    expect(req.destroy).toHaveBeenCalled();
  });

  it("uses the Content-Type header from the response", async () => {
    const req = createMockRequest();
    const res = createMockResponse(200, "image/webp");
    const data = Buffer.from("fake-webp-data");

    mockHttpsRequest.mockImplementation((_options, callback) => {
      process.nextTick(() => {
        callback(res);
        res.emit("data", data);
        res.emit("end");
      });
      return req;
    });

    const result = await downloadImage("https://example.com/photo");
    expect(result.contentType).toBe("image/webp");
  });

  it("falls back to application/octet-stream when no Content-Type header is present", async () => {
    const req = createMockRequest();
    const res = createMockResponse(200); // no content-type header
    const data = Buffer.from("fake-data");

    mockHttpsRequest.mockImplementation((_options, callback) => {
      process.nextTick(() => {
        callback(res);
        res.emit("data", data);
        res.emit("end");
      });
      return req;
    });

    const result = await downloadImage("https://example.com/unknown");
    expect(result.contentType).toBe("application/octet-stream");
  });

  it("rejects when Content-Length exceeds maxBytes", async () => {
    const req = createMockRequest();
    const res = createMockResponse(200, "image/png");
    res.headers["content-length"] = "200"; // 200 bytes declared

    mockHttpsRequest.mockImplementation((_options, callback) => {
      process.nextTick(() => {
        callback(res);
        res.emit("end");
      });
      return req;
    });

    await expect(
      downloadImage("https://example.com/huge.png", undefined, 100)
    ).rejects.toThrow(/exceeds maximum/);
    expect(req.destroy).toHaveBeenCalled();
  });

  it("rejects when cumulative data exceeds maxBytes", async () => {
    const req = createMockRequest();
    const res = createMockResponse(200, "image/png");
    // No Content-Length header — size discovered only as data arrives

    mockHttpsRequest.mockImplementation((_options, callback) => {
      process.nextTick(() => {
        callback(res);
        res.emit("data", Buffer.alloc(60));
        res.emit("data", Buffer.alloc(60)); // total 120 > 100 limit
      });
      return req;
    });

    await expect(
      downloadImage("https://example.com/huge.png", undefined, 100)
    ).rejects.toThrow(/exceeds maximum/);
    expect(req.destroy).toHaveBeenCalled();
  });
});
