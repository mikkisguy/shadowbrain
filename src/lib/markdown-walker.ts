import { readdir } from "fs/promises";
import { extname, join, relative, sep } from "path";

/**
 * Maximum file size (in bytes) the importer will attempt to read.
 * Notes larger than this are skipped to avoid runaway memory on a
 * stray binary file with a `.md` extension. 5 MiB is generous for
 * personal note text and well under any sensible per-file limit.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Files whose name starts with a dot (`.foo.md`) are skipped — they
 * are conventionally hidden / config files and not user notes.
 *
 * The caller passes `/`-normalised relative paths, so we split on
 * `/` directly rather than the platform `sep`. `walkMarkdownFiles`
 * normalises both before calling.
 */
function isHiddenPath(relPath: string): boolean {
  const parts = relPath.split("/");
  return parts.some((part) => part.startsWith("."));
}

/**
 * Recursively find all `.md` files under root, skipping hidden paths.
 * Returns absolute paths sorted alphabetically.
 */
export async function walkMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (extname(entry.name).toLowerCase() !== ".md") continue;
      // Normalise to `/` so the caller and isHiddenPath agree on
      // path separators regardless of platform.
      const rel = relative(root, full).split(sep).join("/");
      if (isHiddenPath(rel)) continue;
      out.push(full);
    }
  }

  await walk(root);
  out.sort();
  return out;
}
