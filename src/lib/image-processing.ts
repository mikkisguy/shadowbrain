import path from "path";
import { promises as fs } from "fs";
import http from "http";
import https from "https";
import type { LookupFunction } from "node:net";
import sharp from "sharp";
import { getEnv } from "@/lib/env";
import { getImagesDir } from "@/lib/storage";

export interface ProcessImageResult {
  imagePath: string;
  metadata: {
    original_filename: string;
    width: number;
    height: number;
    format: string;
    size_bytes: number;
  };
}

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
  "image/gif",
]);

export function sanitizeFilename(name: string): string {
  const basename = path.basename(name);
  const sanitized =
    basename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "")
      .replace(/\.\.+/g, ".") || "file";
  const maxLen = 120;
  if (sanitized.length > maxLen) {
    const ext = path.extname(sanitized);
    const base = sanitized.slice(0, maxLen - ext.length);
    return base + ext;
  }
  return sanitized;
}

export function validateImageMime(mime: string): boolean {
  return ALLOWED_MIMES.has(mime);
}

export async function processImage(
  buffer: Buffer,
  originalFilename: string
): Promise<ProcessImageResult> {
  const env = getEnv();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const uuid = crypto.randomUUID();
  const relativePath = `${yearMonth}/${uuid}.webp`;
  const fullDir = path.join(getImagesDir(), yearMonth);

  await fs.mkdir(fullDir, { recursive: true });

  const fullPath = path.join(getImagesDir(), relativePath);
  const metadata = await sharp(buffer).metadata();
  const img = sharp(buffer, { animated: true });

  // Guard against extremely large images that could cause memory pressure.
  // Resize to fit within 10000x10000 without enlarging smaller images.
  const result = await img
    .resize({
      width: 10000,
      height: 10000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: env.WEBP_QUALITY })
    .toFile(fullPath);

  return {
    imagePath: relativePath,
    metadata: {
      original_filename: sanitizeFilename(originalFilename),
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      format: "webp",
      size_bytes: result.size,
    },
  };
}

export async function downloadImage(
  url: string,
  safeLookup?: LookupFunction,
  maxBytes?: number
): Promise<{ buffer: Buffer; contentType: string }> {
  const limit = maxBytes ?? getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "ShadowBrain/1.0",
      },
    };

    if (safeLookup) {
      options.lookup = safeLookup;
    }

    const req = transport.request(options, (res) => {
      // Fast-fail: if Content-Length is present and exceeds the limit,
      // abort before buffering any data.
      const contentLength = res.headers["content-length"];
      if (contentLength) {
        const declared = parseInt(contentLength, 10);
        if (!Number.isNaN(declared) && declared > limit) {
          req.destroy();
          reject(
            new Error(
              `Response size (${declared} bytes) exceeds maximum of ${limit} bytes`
            )
          );
          return;
        }
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      res.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > limit) {
          req.destroy();
          reject(new Error(`Response size exceeds maximum of ${limit} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Failed to download image: HTTP ${res.statusCode}`));
          return;
        }
        const contentType =
          res.headers["content-type"] ?? "application/octet-stream";
        const ct = Array.isArray(contentType) ? contentType[0]! : contentType;
        resolve({ buffer: Buffer.concat(chunks), contentType: ct });
      });
    });

    req.on("error", reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}
