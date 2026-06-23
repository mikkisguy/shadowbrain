/**
 * CLI entry point for the docs sync system.
 *
 * Reads the `docs/` directory at the project root and upserts every
 * `.md` file as a `content_item` with `type='note'` and
 * `source='docs-sync'`, tagged `project:shadowbrain`, `docs`, and a
 * path-derived category tag (names stored without `#`; the UI renders the
 * `#` prefix). Files removed from disk are pruned from the
 * database. Re-running is safe and idempotent.
 *
 * Usage:
 *   pnpm sync:docs
 *   pnpm sync:docs --dir /path/to/docs
 *   pnpm sync:docs --force        # re-write every file
 *   pnpm sync:docs --dry-run      # preview without writing
 *
 * Exits non-zero when at least one file failed to sync, or when a
 * transaction-level failure aborts the run. The summary is printed for
 * per-file failures; a crash short-circuits to the error handler.
 */
import { resolve } from "path";
import { getDb, closeDb } from "@/db/index";
import { syncDocsDirectory, formatDocsSyncResult } from "@/lib/docs-sync";
import { log } from "@/lib/logger";

interface CliArgs {
  dir: string;
  force: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let dir: string | null = null;
  let force = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir" || arg === "-d") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--dir requires a path argument");
      }
      dir = next;
      i += 1;
    } else if (arg.startsWith("--dir=")) {
      dir = arg.slice("--dir=".length);
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    dir: dir ?? resolve(process.cwd(), "docs"),
    force,
    dryRun,
  };
}

function printHelp(): void {
  console.log(`Usage: pnpm sync:docs [--dir <path>] [--force] [--dry-run]

Reads .md files from <path> (default: ./docs) and upserts each as a
content_item with type='note' and source='docs-sync'. Each doc is tagged
#project:shadowbrain, #docs, and a category tag derived from its path.
Files removed from disk are pruned. Re-runs are idempotent.

Options:
  -d, --dir <path>   Directory to sync (default: ./docs)
  --force            Re-write every file even if the stored content
                     matches the on-disk version.
  --dry-run          Preview changes without writing to the database.
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
    const result = await syncDocsDirectory(db, args.dir, {
      skipUnchanged: !args.force,
      dryRun: args.dryRun,
    });
    console.log(formatDocsSyncResult(result));
    log("info", "docs sync complete", {
      event: "docs.sync.complete",
      directory: result.directory,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      deleted: result.deleted,
      failed: result.failed,
      force: args.force,
      dryRun: args.dryRun,
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
  console.error(`Docs sync failed: ${message}`);
  log("error", "docs sync crashed", {
    event: "docs.sync.crash",
    error: err instanceof Error ? { message, stack: err.stack } : message,
  });
  process.exit(1);
});
