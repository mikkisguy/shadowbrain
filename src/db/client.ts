import Database from "better-sqlite3";
import { join, isAbsolute } from "path";
import { existsSync, mkdirSync } from "fs";
import { runMigrations, VECTOR_SEARCH_MIGRATION_VERSION } from "./migrations";
import { seedSettings } from "./seed-settings";
import { getEnv } from "@/lib/env";
import { isVecExtensionLoaded } from "./vectors";

export type NodeEnv = "development" | "production" | "test" | "e2e";

function isNodeEnv(v: string | undefined): v is NodeEnv {
  return (
    v === "development" || v === "production" || v === "test" || v === "e2e"
  );
}

export function getDbPath(
  env: NodeEnv = isNodeEnv(process.env.NODE_ENV)
    ? process.env.NODE_ENV
    : "development"
): string {
  const projectName = "shadowbrain";
  // In test env, each vitest worker (one per test file) gets its own DB file
  // so concurrent test files don't trample each other's schema_migrations
  // and on-disk state. Falls back to the shared name outside of vitest.
  let suffix: string;
  if (env === "test") {
    const workerId = process.env.VITEST_POOL_ID;
    suffix = workerId ? `.test.${workerId}` : ".test";
  } else if (env === "e2e") {
    suffix = ".e2e";
  } else if (env === "development") {
    suffix = ".dev";
  } else {
    suffix = "";
  }
  const filename = `${projectName}${suffix}.db`;

  // Resolve the project root robustly across runtimes. The bundled
  // server (Next.js dev / production builds) may have a different
  // `__dirname` than the source tree, so we prefer `process.cwd()` —
  // the directory where `node` was invoked, which is the project
  // root in dev, in production, and in tests. The previous version
  // of this function used `join(__dirname, "..", "..")`, which
  // resolved to `.next/...` in the bundled dev server and broke
  // DATA_DIR resolution at request time (audit log writes failed
  // with "directory does not exist" because the relative path was
  // not relative to the project root).
  const projectRoot = process.cwd();
  const dataDir = getEnv().DATA_DIR;
  const resolvedDir = isAbsolute(dataDir)
    ? dataDir
    : join(projectRoot, dataDir);

  // Make sure the parent directory exists before returning the
  // path. better-sqlite3 will create the file itself, but it does
  // NOT create missing parent directories — a fresh deploy with an
  // empty `data/` would throw on the first `audit_logs` write.
  // `mkdirSync(..., { recursive: true })` is a no-op when the
  // directory already exists.
  try {
    mkdirSync(resolvedDir, { recursive: true });
  } catch (err) {
    // Re-throw with a clearer message — better-sqlite3's own error
    // is "Cannot open database because the directory does not
    // exist" which points at the file, not the directory.
    throw new Error(
      `Failed to ensure data directory exists at ${resolvedDir}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return join(resolvedDir, filename);
}

export interface DbConfig {
  env?: NodeEnv;
  path?: string;
  wal?: boolean;
  foreignKeys?: boolean;
  migrate?: boolean;
}

const instances = new Map<string, Database.Database>();

/**
 * Load the sqlite-vec extension for vector search functionality.
 * The extension is loaded from dist/extensions/vec0.so in development/production,
 * or from a bundled location in production builds.
 */
function loadVecExtension(db: Database.Database): void {
  const basePaths = [
    join(__dirname, "..", "..", "dist", "extensions", "vec0"),
    join(__dirname, "..", "..", "..", "dist", "extensions", "vec0"),
    "/app/dist/extensions/vec0", // Docker production path
  ];

  const platformSuffixes = [".so", ".dylib", ".dll"];
  const extensionPaths = basePaths.flatMap((base) =>
    platformSuffixes.map((suffix) => base + suffix)
  );

  let loaded = false;
  for (const path of extensionPaths) {
    if (existsSync(path)) {
      try {
        db.loadExtension(path);
        console.log(`✓ Loaded sqlite-vec extension from: ${path}`);
        loaded = true;
        break;
      } catch (err) {
        console.warn(`Failed to load sqlite-vec from ${path}:`, err);
      }
    }
  }

  if (!loaded) {
    console.warn(
      "sqlite-vec extension not loaded. Vector search functionality will be unavailable."
    );
  }
}

/**
 * Get or create a database connection.
 * Config is only applied on initial creation; subsequent calls with
 * the same path and env return the cached instance unchanged.
 */
export function getDb(config: DbConfig = {}): Database.Database {
  const {
    env = isNodeEnv(process.env.NODE_ENV)
      ? process.env.NODE_ENV
      : "development",
    path: customPath,
    wal = true,
    foreignKeys = true,
    migrate = true,
  } = config;

  const dbPath = customPath || getDbPath(env);
  const cacheKey = `${dbPath}:${env}`;

  if (instances.has(cacheKey)) {
    return instances.get(cacheKey)!;
  }

  const db = new Database(dbPath);

  if (wal) {
    db.pragma("journal_mode = WAL");
  }
  if (foreignKeys) {
    db.pragma("foreign_keys = ON");
  }

  // Load sqlite-vec extension for vector search
  loadVecExtension(db);

  if (migrate) {
    // If the vec0 extension is not available, skip the vector search
    // migration so runMigrations does not crash on startup.
    const skipVersions = !isVecExtensionLoaded(db)
      ? [VECTOR_SEARCH_MIGRATION_VERSION]
      : undefined;
    runMigrations(db, { skipVersions });

    // Sync env vars into settings table (only on first connection)
    seedSettings(db);
  }

  instances.set(cacheKey, db);
  return db;
}

export interface CloseDbConfig {
  env?: NodeEnv;
  path?: string;
}

export function closeDb(config?: CloseDbConfig): void;
export function closeDb(env?: NodeEnv): void;
export function closeDb(arg?: NodeEnv | CloseDbConfig): void {
  if (!arg) {
    for (const [, db] of instances.entries()) {
      db.close();
    }
    instances.clear();
    return;
  }

  let env: NodeEnv;
  let customPath: string | undefined;

  if (typeof arg === "string") {
    env = arg;
  } else {
    env =
      arg.env ||
      (isNodeEnv(process.env.NODE_ENV) ? process.env.NODE_ENV : "development");
    customPath = arg.path;
  }

  const dbPath = customPath || getDbPath(env);
  const cacheKey = `${dbPath}:${env}`;
  const db = instances.get(cacheKey);
  if (db) {
    db.close();
    instances.delete(cacheKey);
  }
}

export function getDevelopmentDb(): Database.Database {
  return getDb({ env: "development" });
}

export function getTestDb(): Database.Database {
  return getDb({ env: "test" });
}

export function getE2eDb(): Database.Database {
  return getDb({ env: "e2e" });
}

export function getProductionDb(): Database.Database {
  return getDb({ env: "production" });
}
