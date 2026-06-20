import path from "path";
import { promises as fs } from "fs";
import { isAbsolute, join } from "path";
import { getEnv } from "@/lib/env";

/**
 * Resolve the absolute path to the images directory.
 *
 * Images live at `<DATA_DIR>/images` so they share the same persistent
 * volume as the database. Computing this per call (rather than at
 * module load) means tests can override `DATA_DIR` before the first
 * `getEnv()` call without hitting a stale cached value.
 */
export function getImagesDir(): string {
  const dataDir = getEnv().DATA_DIR;
  // Resolve relative DATA_DIR against the project root, mirroring
  // `getDbPath` in src/db/index.ts so image storage and the database
  // follow the same base-directory convention in dev, test, and prod.
  const projectRoot = join(__dirname, "..", "..");
  const resolvedDir = isAbsolute(dataDir)
    ? dataDir
    : join(projectRoot, dataDir);
  return join(resolvedDir, "images");
}

/**
 * Resolve a relative image path to an absolute file system path and
 * verify that the result stays inside the images directory.
 *
 * Throws an `Error` with message
 * `"Invalid image path: path traversal detected"` if the resolved
 * path escapes the images directory. This is the hard guarantee —
 * route handlers should map that error to a 400 response.
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
  // comparison works cross-platform.
  const isWithinDirectory =
    normalizedResolved === normalizedImagesDir ||
    normalizedResolved.startsWith(normalizedImagesDir + path.sep) ||
    normalizedResolved.startsWith(normalizedImagesDir + "/");

  if (!isWithinDirectory) {
    throw new Error("Invalid image path: path traversal detected");
  }

  return resolvedPath;
}

/**
 * Delete an image file. Returns `false` if the file does not exist,
 * re-throws any other filesystem error.
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
