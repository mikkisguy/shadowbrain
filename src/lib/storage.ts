import path from "path";
import { promises as fs } from "fs";
import { getEnv } from "@/lib/env";

/**
 * Thrown by `getImageFullPath` when a relative image path resolves
 * to a location outside the images directory. Callers should map
 * this to a 400 response.
 */
export class PathTraversalError extends Error {
  constructor() {
    super("Invalid image path: path traversal detected");
    this.name = "PathTraversalError";
  }
}

/**
 * Resolve the absolute path to the images directory.
 *
 * Images live at `<DATA_DIR>/images` so they share the same persistent
 * volume as the database. Computing this per call (rather than at
 * module load) means tests can override `DATA_DIR` before the first
 * `getEnv()` call without hitting a stale cached value.
 *
 * Uses `process.cwd()` for robust project-root resolution across
 * runtimes (dev / production / tests). The previous version used
 * `join(__dirname, "..", "..")`, which resolved to `.next/...`
 * in the bundled dev server and broke DATA_DIR resolution.
 */
export function getImagesDir(): string {
  const dataDir = getEnv().DATA_DIR;
  const projectRoot = process.cwd();
  const resolvedDir = path.isAbsolute(dataDir)
    ? dataDir
    : path.join(projectRoot, dataDir);
  return path.join(resolvedDir, "images");
}

/**
 * Resolve a relative image path to an absolute file system path and
 * verify that the result stays inside the images directory.
 *
 * Throws `PathTraversalError` if the resolved path escapes the
 * images directory. This is the hard guarantee — route handlers
 * should map that error to a 400 response.
 */
export function getImageFullPath(relativePath: string): string {
  const imagesDir = getImagesDir();
  const resolvedPath = path.resolve(imagesDir, relativePath);
  const imagesDirResolved = path.resolve(imagesDir);

  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedImagesDir = path.normalize(imagesDirResolved);

  // Containment check: the resolved path must equal the images dir
  // (impossible for a file but covered for completeness) or live
  // strictly beneath it. We check both `path.sep` and `/` so the
  // comparison works on platforms where `path.sep` is `\` (Windows):
  // on Linux the two `startsWith` calls are equivalent, but on
  // Windows they catch different normalization outputs.
  const isWithinDirectory =
    normalizedResolved === normalizedImagesDir ||
    normalizedResolved.startsWith(normalizedImagesDir + path.sep) ||
    normalizedResolved.startsWith(normalizedImagesDir + "/");

  if (!isWithinDirectory) {
    throw new PathTraversalError();
  }

  return resolvedPath;
}

/**
 * Delete an image file. Returns `false` if the file does not exist,
 * re-throws any other filesystem error.
 *
 * Not used by the read-only `/api/images/[...path]` route — included
 * for the future image-management endpoints (e.g. delete from the
 * Discord / web capture pipeline, see phases.md §2.6).
 *
 * TODO(#44): Used by future image delete endpoint.
 */
export async function deleteImage(relativePath: string): Promise<boolean> {
  try {
    const fullPath = getImageFullPath(relativePath);
    await fs.unlink(fullPath);
    return true;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return false;
    }
    throw err;
  }
}
