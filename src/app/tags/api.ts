/**
 * Browser-side API client for the Tags page.
 *
 * Wraps `fetch` for the four `/api/tags` operations the page needs:
 *   - `fetchTags()`      — `GET /api/tags`            (list with counts)
 *   - `createTag(name)`  — `POST /api/tags`           (create)
 *   - `renameTag(id, …)` — `PATCH /api/tags/[id]`     (rename)
 *   - `deleteTag(id)`    — `DELETE /api/tags/[id]`    (delete)
 *
 * Every call uses `credentials: "same-origin"` so the HttpOnly
 * session cookie rides along, matching the rest of the app.
 *
 * Failures throw a `TagsApiError` carrying the HTTP status and the
 * server's `code` (e.g. `CONFLICT`) when present, so the dialogs can
 * map a 409 to an inline "name already exists" message instead of the
 * generic error banner.
 */

import type { TagWithCount } from "./types";

export class TagsApiError extends Error {
  readonly status: number;
  /** The server's machine-readable error code, when present
   *  (e.g. `CONFLICT`, `VALIDATION_ERROR`). */
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "TagsApiError";
    this.status = status;
    this.code = code;
  }
}

/** Read the `error.code` field from a JSON error body, tolerating a
 *  non-JSON or unexpectedly-shaped response. */
async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as unknown;
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "code" in body.error &&
      typeof (body.error as { code: unknown }).code === "string"
    ) {
      return (body.error as { code: string }).code;
    }
  } catch {
    // Non-JSON body — fall through to a null code.
  }
  return null;
}

async function throwForResponse(response: Response): Promise<never> {
  const code = await readErrorCode(response);
  throw new TagsApiError(
    response.status,
    `Request failed with status ${response.status}`,
    code
  );
}

/** Fetch all tags with their usage counts. */
export async function fetchTags(signal?: AbortSignal): Promise<TagWithCount[]> {
  const response = await fetch("/api/tags", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) await throwForResponse(response);

  const body = (await response.json()) as { tags?: unknown };
  return Array.isArray(body.tags) ? (body.tags as TagWithCount[]) : [];
}

/** Create a new tag. Resolves with the created tag row. */
export async function createTag(name: string): Promise<TagWithCount> {
  const response = await fetch("/api/tags", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) await throwForResponse(response);
  return (await response.json()) as TagWithCount;
}

/** Rename an existing tag. Resolves with the updated tag row. */
export async function renameTag(
  id: string,
  name: string
): Promise<TagWithCount> {
  const response = await fetch(`/api/tags/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) await throwForResponse(response);
  return (await response.json()) as TagWithCount;
}

/** Delete a tag. */
export async function deleteTag(id: string): Promise<void> {
  const response = await fetch(`/api/tags/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) await throwForResponse(response);
}
