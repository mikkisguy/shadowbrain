/**
 * File-system discovery helpers for the docs sync system.
 *
 * @module
 */
import { readdir } from "fs/promises";
import { extname, join, relative, sep } from "path";

/**
 * Maximum file size (in bytes) the syncer will read. Matches the markdown
 * importer cap so a stray binary masquerading as `.md` cannot exhaust
 * memory.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Files whose name starts with a dot are conventionally hidden / config. */
function isHiddenPath(relPath: string): boolean {
  return relPath.split("/").some((part) => part.startsWith("."));
}

/** Recursively collect every non-hidden `.md` file under `root`. */
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
      const rel = relative(root, full).split(sep).join("/");
      if (isHiddenPath(rel)) continue;
      out.push(full);
    }
  }

  await walk(root);
  out.sort();
  return out;
}
