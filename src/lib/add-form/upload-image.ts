/**
 * Shared image upload helper.
 *
 * Accepts either a File object (multipart/form-data upload) or a URL string
 * (JSON upload), plus optional title and content. Posts to /api/images and
 * returns the created content item on success. Throws an Error with the
 * server's error message on failure.
 */

/** Minimal shape of the content item returned by POST /api/images. */
export interface UploadedImage {
  id: string;
  type: string;
  image_path: string;
  [key: string]: unknown;
}

export async function uploadImage(
  fileOrUrl: File | string,
  options?: { title?: string; content?: string }
): Promise<UploadedImage> {
  const { title, content } = options ?? {};

  if (fileOrUrl instanceof File) {
    const fd = new FormData();
    fd.append("file", fileOrUrl);
    if (title?.trim()) fd.append("title", title);
    if (content?.trim()) fd.append("content", content);

    const res = await fetch("/api/images", {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const msg: string | undefined = payload?.error?.message;
      throw new Error(msg ?? "Failed to upload image");
    }

    return res.json();
  }

  // URL upload
  const body: Record<string, unknown> = { url: fileOrUrl };
  if (title?.trim()) body.title = title;
  if (content?.trim()) body.content = content;

  const res = await fetch("/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const msg: string | undefined = payload?.error?.message;
    throw new Error(msg ?? "Failed to upload image");
  }

  return res.json();
}
