import { describe, it, expect, beforeEach, vi } from "vitest";
import { authedRequest } from "@/db/test-utils";

// Mock the SSRF validator
vi.mock("@/lib/ssrf", () => ({
  validateFetchUrl: vi.fn(),
}));

import { validateFetchUrl } from "@/lib/ssrf";
import { GET } from "@/app/api/bookmarks/image-proxy/route";

const mockValidateFetchUrl = vi.mocked(validateFetchUrl);

describe("GET /api/bookmarks/image-proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without auth", async () => {
    const req = new Request(
      "http://localhost/api/bookmarks/image-proxy?url=https://example.com/favicon.ico"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when url param is missing", async () => {
    const req = await authedRequest(
      "http://localhost/api/bookmarks/image-proxy"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid URL", async () => {
    const req = await authedRequest(
      "http://localhost/api/bookmarks/image-proxy?url=not-a-url"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when SSRF validation fails", async () => {
    mockValidateFetchUrl.mockResolvedValue({
      ok: false,
      reason: "blocked IP",
    });
    const req = await authedRequest(
      "http://localhost/api/bookmarks/image-proxy?url=https://169.254.169.254/metadata"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
