import Database from "better-sqlite3";
import { join, isAbsolute } from "path";
import { existsSync } from "fs";
import { runMigrations, VECTOR_SEARCH_MIGRATION_VERSION } from "./migrations";
import { seedSettings } from "./seed-settings";
import { getEnv } from "@/lib/env";
import { isVecExtensionLoaded } from "./vectors";

export type NodeEnv = "development" | "production" | "test";

function isNodeEnv(v: string | undefined): v is NodeEnv {
  return v === "development" || v === "production" || v === "test";
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
  } else if (env === "development") {
    suffix = ".dev";
  } else {
    suffix = "";
  }
  const filename = `${projectName}${suffix}.db`;

  // Use absolute path to avoid process.cwd() issues when requiring better-sqlite3
  // Import.meta.url would be ideal but this is CommonJS, so we use __dirname
  const projectRoot = join(__dirname, "..", "..");
  const dataDir = getEnv().DATA_DIR;
  const resolvedDir = isAbsolute(dataDir)
    ? dataDir
    : join(projectRoot, dataDir);
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

export function getProductionDb(): Database.Database {
  return getDb({ env: "production" });
}
