import path from "path";
import { promises as fs } from "fs";
import { z } from "zod";
import { getDb, contentItems, auditLogs } from "@/db/index";
import { errorResponse, parseJson, logServerError } from "@/lib/api";
import { log } from "@/lib/logger";
import { requireAuthenticated } from "@/lib/auth/guard";
import { getEnv } from "@/lib/env";
import { getImagesDir } from "@/lib/storage";
import {
  processImage,
  validateImageMime,
  downloadImage,
} from "@/lib/image-processing";
import {
  validateFetchUrl,
  BLOCKED_IP,
  DISALLOWED_SCHEME,
  INVALID_URL,
  DNS_RESOLUTION_FAILED,
  DNS_TIMEOUT,
} from "@/lib/ssrf";

const jsonSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuthenticated(request);
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return handleFileUpload(request);
    }

    if (contentType.includes("application/json")) {
      return handleUrlUpload(request);
    }

    return errorResponse(
      "VALIDATION_ERROR",
      "Content-Type must be multipart/form-data or application/json",
      400
    );
  } catch (error) {
    logServerError(error, { route: "/api/images", method: "POST" });
    return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
  }
}

async function handleFileUpload(request: Request) {
  const env = getEnv();
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid form data", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return errorResponse("VALIDATION_ERROR", "File is required", 400);
  }

  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return errorResponse(
      "VALIDATION_ERROR",
      `File exceeds maximum size of ${env.MAX_UPLOAD_SIZE_MB} MB`,
      400
    );
  }

  if (file.size === 0) {
    return errorResponse("VALIDATION_ERROR", "File is empty", 400);
  }

  if (!validateImageMime(file.type)) {
    return errorResponse("VALIDATION_ERROR", "Unsupported image format", 400);
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return errorResponse("VALIDATION_ERROR", "Failed to read file", 400);
  }

  let processed;
  try {
    processed = await processImage(buffer, file.name);
  } catch (err) {
    log("warn", "image processing failed", {
      event: "image.upload.failed",
      filename: file.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(
      "VALIDATION_ERROR",
      "Failed to process image. The file may be corrupt or in an unsupported format.",
      400
    );
  }

  const title = formData.get("title");
  const content = formData.get("content");

  try {
    return await createImageItem(
      processed.imagePath,
      processed.metadata,
      typeof title === "string" ? title : null,
      typeof content === "string" ? content : null
    );
  } catch (err) {
    // Roll back the file — DB is the source of truth
    try {
      await fs.unlink(path.join(getImagesDir(), processed.imagePath));
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

async function handleUrlUpload(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON", 400);
  }

  const parsed = parseJson(jsonSchema, body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      issues: parsed.details,
    });
  }

  const { url, title, content } = parsed.data;

  const validation = await validateFetchUrl(url);
  if (!validation.ok) {
    const reasonMap: Record<string, number> = {
      [BLOCKED_IP]: 400,
      [DISALLOWED_SCHEME]: 400,
      [INVALID_URL]: 400,
      [DNS_RESOLUTION_FAILED]: 502,
      [DNS_TIMEOUT]: 504,
    };
    return errorResponse(
      "VALIDATION_ERROR",
      validation.reason,
      reasonMap[validation.reason] ?? 400
    );
  }

  let downloadResult;
  try {
    downloadResult = await downloadImage(url, validation.safeLookup);
  } catch (err) {
    log("warn", "image download failed", {
      event: "image.download.failed",
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(
      "VALIDATION_ERROR",
      "Failed to download image from the provided URL",
      502
    );
  }

  if (!validateImageMime(downloadResult.contentType)) {
    return errorResponse(
      "VALIDATION_ERROR",
      "The URL does not point to a supported image format",
      400
    );
  }

  const urlObj = new URL(url);
  const originalFilename = path.basename(urlObj.pathname) || "image";

  let processed;
  try {
    processed = await processImage(downloadResult.buffer, originalFilename);
  } catch (err) {
    log("warn", "image processing failed", {
      event: "image.download.processing_failed",
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(
      "VALIDATION_ERROR",
      "Failed to process downloaded image. The file may be corrupt or in an unsupported format.",
      400
    );
  }

  try {
    return await createImageItem(
      processed.imagePath,
      processed.metadata,
      title ?? null,
      content ?? null
    );
  } catch (err) {
    // Roll back the file — DB is the source of truth
    try {
      await fs.unlink(path.join(getImagesDir(), processed.imagePath));
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

async function createImageItem(
  imagePath: string,
  imageMeta: Record<string, unknown>,
  title: string | null,
  content: string | null
) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const auditLogId = crypto.randomUUID();
  const db = getDb();

  const metadata = JSON.stringify({
    ...imageMeta,
    captured_at: now,
  });

  const effectiveContent = content?.trim() || title?.trim() || "Image";
  const effectiveTitle = title?.trim() || null;

  const tx = db.transaction(() => {
    contentItems.create(db, {
      id,
      type: "image",
      title: effectiveTitle,
      content: effectiveContent,
      image_path: imagePath,
      source: "web",
      source_url: null,
      metadata,
      is_private: 0,
      is_hidden: 0,
      created_at: now,
      updated_at: now,
    });

    auditLogs.create(db, {
      id: auditLogId,
      actor_type: "system",
      action: "content_item.create",
      entity_type: "content_item",
      entity_id: id,
      success: 1,
      metadata: null,
      created_at: now,
    });
  });
  tx();

  log("info", "image uploaded and content_item created", {
    event: "image.upload",
    id,
    imagePath,
  });

  const item = contentItems.findById(db, id, {
    includeHidden: true,
    includePrivate: true,
  });

  return Response.json(item, { status: 201 });
}
