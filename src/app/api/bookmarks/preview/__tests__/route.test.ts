import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authedRequest } from "@/db/test-utils";
import { GET } from "@/app/api/bookmarks/preview/route";

// Mock the metadata-fetcher so tests never hit the network.
vi.mock("@/lib/metadata-fetcher", () => ({
  safeFetchHtml: vi.fn(),
  extractBookmarkMetadata: vi.fn(),
}));

import { safeFetchHtml, extractBookmarkMetadata } from "@/lib/metadata-fetcher";

const mockSafeFetchHtml = vi.mocked(safeFetchHtml);
const mockExtractBookmarkMetadata = vi.mocked(extractBookmarkMetadata);

describe("GET /api/bookmarks/preview", () => {
  beforeEach(() => {
    mockSafeFetchHtml.mockReset();
    mockExtractBookmarkMetadata.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 without auth", async () => {
    const req = new Request(
      "http://localhost/api/bookmarks/preview?url=https://example.com"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when url param is missing", async () => {
    const req = await authedRequest("http://localhost/api/bookmarks/preview");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for an invalid URL", async () => {
    const req = await authedRequest(
      "http://localhost/api/bookmarks/preview?url=not-a-url"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns ok:true with metadata for a valid URL", async () => {
    mockSafeFetchHtml.mockResolvedValue(
      "<html><head><title>Test</title></head></html>"
    );
    mockExtractBookmarkMetadata.mockReturnValue({
      url: "https://example.com",
      title: "Test Page",
      description: "A test page",
      favicon: "https://example.com/favicon.ico",
      site_name: "Example",
      image: null,
    });

    const req = await authedRequest(
      "http://localhost/api/bookmarks/preview?url=https://example.com"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.metadata.title).toBe("Test Page");
    expect(json.metadata.description).toBe("A test page");
    expect(json.metadata.favicon).toBe("https://example.com/favicon.ico");
    expect(json.metadata.site_name).toBe("Example");
    expect(json.metadata.url).toBe("https://example.com");
    expect(json.metadata.fetched_at).toBeDefined();
  });

  it("returns ok:false when safeFetchHtml throws (e.g. private IP)", async () => {
    mockSafeFetchHtml.mockRejectedValue(new Error("blocked private IP"));

    const req = await authedRequest(
      "http://localhost/api/bookmarks/preview?url=https://example.com"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("blocked private IP");
    expect(json.metadata.url).toBe("https://example.com");
    expect(json.metadata.fetched_at).toBeDefined();
  });

  it("passes the URL through safeFetchHtml", async () => {
    mockSafeFetchHtml.mockResolvedValue(
      "<html><head><title>Test</title></head></html>"
    );
    mockExtractBookmarkMetadata.mockReturnValue({
      url: "https://example.com",
      title: "Test Page",
      description: null,
      favicon: null,
      site_name: null,
      image: null,
    });

    const req = await authedRequest(
      "http://localhost/api/bookmarks/preview?url=https://example.com"
    );
    await GET(req);

    expect(mockSafeFetchHtml).toHaveBeenCalledWith("https://example.com");
  });

  it("calls extractBookmarkMetadata with the fetched HTML", async () => {
    const html = "<html><head><title>My Site</title></head></html>";
    mockSafeFetchHtml.mockResolvedValue(html);
    mockExtractBookmarkMetadata.mockReturnValue({
      url: "https://mysite.com",
      title: "My Site",
      description: null,
      favicon: null,
      site_name: null,
      image: null,
    });

    const req = await authedRequest(
      "http://localhost/api/bookmarks/preview?url=https://mysite.com"
    );
    await GET(req);

    expect(mockExtractBookmarkMetadata).toHaveBeenCalledWith(
      html,
      "https://mysite.com"
    );
  });
});
