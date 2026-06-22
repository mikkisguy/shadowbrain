# Images

Serve stored images with path traversal protection and immutable caching.

---

## GET /api/images/{path}

Serve an image from the data/images directory.

### Path Parameter

| Parameter | Type   | Description                                 |
| --------- | ------ | ------------------------------------------- |
| `path`    | string | Relative path (e.g., `2026-05/abc123.webp`) |

The path is joined from segments. Next.js catch-all routes require at
least one segment.

### Request

```http
GET /api/images/2026-05/abc123.webp
Cookie: sb_session=...
```

### Path Traversal Protection

The handler rejects:

- Absolute paths
- Paths containing `..` or null bytes
- Paths longer than 200 characters
- Any path escaping the images directory

Rejection returns 400 (not 404) to avoid leaking directory structure.

### Response (200)

Returns the image binary with:

| Header          | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| `Content-Type`  | `image/webp`, `image/jpeg`, `image/png` (or `application/octet-stream` for unknown) |
| `Cache-Control` | `public, max-age=31536000, immutable`                                               |

Supported extensions: `.webp`, `.jpg`, `.jpeg`, `.png`.

SVG and GIF are intentionally not served (XSS surface for SVG, superseded
by animated WebP for GIF).

### Errors

| Status | Code           | Message                            |
| ------ | -------------- | ---------------------------------- |
| 400    | BAD_REQUEST    | Invalid path (traversal, overlong) |
| 401    | UNAUTHORIZED   | Not authenticated                  |
| 404    | NOT_FOUND      | Image not found                    |
| 500    | INTERNAL_ERROR | Server error                       |

### Notes

- Image filenames are content-addressed (UUIDs) by the capture pipeline.
- The `Cache-Control: immutable` header allows browsers/CDNs to skip
  revalidation for a year.
- Debug logs include the path and byte count (suppressed in production).
