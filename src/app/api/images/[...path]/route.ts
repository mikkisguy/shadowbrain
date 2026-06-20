import path from "path";
import { promises as fs } from "fs";
import { getImageFullPath, PathTraversalError } from "@/lib/storage";
import { errorResponse, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";

// Maximum length of the joined relative path we will accept. A
// legitimate monthly directory + UUID + extension fits well under
// 200 chars; longer values are almost certainly a probing or fuzzing
// attempt and we reject them up front.
const MAX_PATH_LENGTH = 200;

// File extension -> Content-Type. Anything outside this map is
// served as `application/octet-stream` so unknown extensions cannot
// trigger MIME sniffing in the browser.
//
// Format policy:
//   - webp:   the canonical capture format (static + animated).
//   - jpg / jpeg / png: kept for backward compatibility with any
//     pre-WebP data imported via the journal-shadows migration (#19).
//
// Explicitly *not* served:
//   - svg: dropped to avoid the inline-script XSS surface that
//     `image/svg+xml` opens in the browser.
//   - gif: superseded by animated WebP. The capture pipeline (#2.6)
//     is expected to use `sharp(input, { animated: true })
//     .webp({ animated: true })` for any source with motion; serving
//     a static `.gif` here would just be a dead path.
const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // TODO: add auth check once session-based auth lands (#53).
  // TODO: apply per-IP rate limit once src/lib/rate-limit.ts lands (#56).
  try {
    const { path: segments } = await params;

    // Next.js only matches the catch-all with at least one segment,
    // so `segments` is guaranteed non-empty. Guard anyway for type
    // safety and future-proofing.
    if (!segments || segments.length === 0) {
      return errorResponse("BAD_REQUEST", "Image path is required", 400);
    }

    const joined = segments.join("/");

    // Reject absolute paths and overlong inputs up front.
    if (path.isAbsolute(joined) || joined.length > MAX_PATH_LENGTH) {
      return errorResponse("BAD_REQUEST", "Invalid image path", 400);
    }

    // `getImageFullPath` enforces containment inside the images
    // directory — anything that escapes (e.g. `..`, absolute paths,
    // null bytes) throws and we map it to a 400 below.
    const fullPath = getImageFullPath(joined);

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(fullPath);
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }
      throw err;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    log("debug", "image served", {
      event: "image.serve",
      // `joined` is user-controlled. We log it server-side only at
      // debug level, which is suppressed when NODE_ENV=production.
      // If we ever raise this to info/warn, redact `joined` first.
      path: joined,
      bytes: buffer.byteLength,
      contentType,
    });

    // `fs.readFile` returns a Node `Buffer`; the `Response`
    // constructor wants a Web `BodyInit`. `Buffer` extends
    // `Uint8Array`, which is valid `BodyInit` in Node 18+, so wrap
    // it in a `Uint8Array` view to satisfy the type checker.
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        // Image filenames are content-addressed (UUIDs) by the
        // capture pipeline, so they are safe to mark immutable for
        // a year. This lets browsers and CDNs skip revalidation.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof PathTraversalError) {
      // Traversal attempts are user errors, not server errors —
      // map to a clean 400 and log at warn level for visibility.
      log("warn", "rejected image path traversal", {
        event: "image.traversal",
      });
      return errorResponse("BAD_REQUEST", "Invalid image path", 400);
    }
    logServerError(error, {
      route: "/api/images/[...path]",
      method: "GET",
    });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}
