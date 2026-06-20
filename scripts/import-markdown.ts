/**
 * CLI entry point for the markdown note importer.
 *
 * Reads the `markdown/` directory at the project root and upserts
 * every `.md` file as a `content_item` with `type='note'`. Re-running
 * the script is safe — files with unchanged content are skipped and
 * existing rows are updated in place.
 *
 * Usage:
 *   pnpm import:markdown
 *   pnpm import:markdown --dir /path/to/notes
 *   pnpm import:markdown --force
 *
 * Exits non-zero only when at least one file failed to import; the
 * summary is still printed so the operator can see what succeeded.
 */
import { resolve } from "path";
import { getDb, closeDb } from "@/db/index";
import {
  importMarkdownDirectory,
  formatImportResult,
} from "@/lib/markdown-importer";
import { log } from "@/lib/logger";

interface CliArgs {
  dir: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let dir: string | null = null;
  let force = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir" || arg === "-d") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--dir requires a path argument");
      }
      dir = next;
      i += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--dir=")) {
      dir = arg.slice("--dir=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { dir: dir ?? resolve(process.cwd(), "markdown"), force };
}

function printHelp(): void {
  console.log(`Usage: pnpm import:markdown [--dir <path>] [--force]

Reads .md files from <path> (default: ./markdown) and upserts each
as a content_item with type='note'. Frontmatter is preserved as
metadata. Re-runs are idempotent.

Options:
  -d, --dir <path>   Directory to import (default: ./markdown)
  --force            Re-write every file even if the stored content
                     matches the on-disk version. Writes an audit log
                     entry per file regardless of whether it changed.
  -h, --help         Show this help
`);
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Argument error: ${message}`);
    printHelp();
    process.exit(2);
  }

  const db = getDb();
  try {
    const result = await importMarkdownDirectory(db, args.dir, {
      skipUnchanged: !args.force,
    });
    console.log(formatImportResult(result));
    log("info", "markdown import complete", {
      event: "markdown.import.complete",
      directory: result.directory,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      force: args.force,
    });
    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Markdown import failed: ${message}`);
  log("error", "markdown import crashed", {
    event: "markdown.import.crash",
    error: err instanceof Error ? { message, stack: err.stack } : message,
  });
  process.exit(1);
});
