import Database from "better-sqlite3";
import { join, isAbsolute } from "path";
import { existsSync } from "fs";
import {
  runMigrations,
  VECTOR_SEARCH_MIGRATION_VERSION,
} from "./migrations";

export type NodeEnv = "development" | "production" | "test";

function isNodeEnv(v: string | undefined): v is NodeEnv {
  return v === "development" || v === "production" || v === "test";
}

export interface ContentItem {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  metadata: string | null;
  is_private: number;
  created_at: string;
  updated_at: string;
}

export interface ContentLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  context: string | null;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface JournalPeriod {
  content_id: string;
  period_start: string;
  period_end: string;
  raw_count: number;
  model_used: string | null;
}

export function getDbPath(
  env: NodeEnv = isNodeEnv(process.env.NODE_ENV)
    ? process.env.NODE_ENV
    : "development"
): string {
  const projectName = "shadowbrain";
  const suffix = env === "test" ? ".test" : env === "development" ? ".dev" : "";
  const filename = `${projectName}${suffix}.db`;

  // Use absolute path to avoid process.cwd() issues when requiring better-sqlite3
  // Import.meta.url would be ideal but this is CommonJS, so we use __dirname
  const projectRoot = join(__dirname, "..", "..");
  const dataDir = process.env.DATA_DIR
    ? isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : join(projectRoot, process.env.DATA_DIR)
    : projectRoot;
  return join(dataDir, filename);
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

export const contentItems = {
  create: (
    db: Database.Database,
    item: {
      id: string;
      type: string;
      title?: string | null;
      content: string;
      image_path?: string | null;
      source?: string;
      source_url?: string | null;
      metadata?: string | null;
      is_private?: number;
      created_at: string;
      updated_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT INTO content_items (
        id, type, title, content, image_path, source, source_url,
        metadata, is_private, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      item.id,
      item.type,
      item.title ?? null,
      item.content,
      item.image_path ?? null,
      item.source ?? "manual",
      item.source_url ?? null,
      item.metadata ?? null,
      item.is_private ?? 0,
      item.created_at,
      item.updated_at
    );
  },

  findById: (db: Database.Database, id: string) => {
    const stmt = db.prepare("SELECT * FROM content_items WHERE id = ?");
    return stmt.get(id) as ContentItem | undefined;
  },

  findAll: (
    db: Database.Database,
    options?: { type?: string; limit?: number; offset?: number }
  ) => {
    let sql = "SELECT * FROM content_items";
    const params: (string | number)[] = [];

    if (options?.type) {
      sql += " WHERE type = ?";
      params.push(options.type);
    }

    sql += " ORDER BY created_at DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const stmt = db.prepare(sql);
    return stmt.all(...params) as ContentItem[];
  },

  update: (
    db: Database.Database,
    id: string,
    updates: {
      title?: string;
      content?: string;
      metadata?: string;
      updated_at: string;
    }
  ) => {
    const fields: string[] = [];
    const params: (string | number)[] = [];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      params.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push("content = ?");
      params.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      params.push(updates.metadata);
    }

    fields.push("updated_at = ?");
    params.push(updates.updated_at);
    params.push(id);

    const stmt = db.prepare(
      `UPDATE content_items SET ${fields.join(", ")} WHERE id = ?`
    );
    return stmt.run(...params);
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare("DELETE FROM content_items WHERE id = ?");
    return stmt.run(id);
  },
};

export const contentLinks = {
  create: (
    db: Database.Database,
    link: {
      id: string;
      source_id: string;
      target_id: string;
      link_type?: string;
      context?: string | null;
      created_at: string;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT INTO content_links (id, source_id, target_id, link_type, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      link.id,
      link.source_id,
      link.target_id,
      link.link_type ?? "reference",
      link.context ?? null,
      link.created_at
    );
  },

  findBySource: (db: Database.Database, sourceId: string) => {
    const stmt = db.prepare("SELECT * FROM content_links WHERE source_id = ?");
    return stmt.all(sourceId) as ContentLink[];
  },

  findByTarget: (db: Database.Database, targetId: string) => {
    const stmt = db.prepare("SELECT * FROM content_links WHERE target_id = ?");
    return stmt.all(targetId) as ContentLink[];
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare("DELETE FROM content_links WHERE id = ?");
    return stmt.run(id);
  },
};

export const tags = {
  create: (
    db: Database.Database,
    tag: { id: string; name: string; color?: string | null; created_at: string }
  ) => {
    const stmt = db.prepare(
      "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)"
    );
    return stmt.run(tag.id, tag.name, tag.color ?? null, tag.created_at);
  },

  findAll: (db: Database.Database) => {
    const stmt = db.prepare("SELECT * FROM tags ORDER BY name");
    return stmt.all() as Tag[];
  },

  findByName: (db: Database.Database, name: string) => {
    const stmt = db.prepare("SELECT * FROM tags WHERE name = ? COLLATE NOCASE");
    return stmt.get(name) as Tag | undefined;
  },

  findById: (db: Database.Database, id: string) => {
    const stmt = db.prepare("SELECT * FROM tags WHERE id = ?");
    return stmt.get(id) as Tag | undefined;
  },
};

export const contentTags = {
  addTag: (
    db: Database.Database,
    contentId: string,
    tagId: string,
    createdAt: string
  ) => {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)"
    );
    return stmt.run(contentId, tagId, createdAt);
  },

  removeTag: (db: Database.Database, contentId: string, tagId: string) => {
    const stmt = db.prepare(
      "DELETE FROM content_tags WHERE content_id = ? AND tag_id = ?"
    );
    return stmt.run(contentId, tagId);
  },

  findByContent: (db: Database.Database, contentId: string) => {
    const stmt = db.prepare(`
      SELECT t.* FROM tags t
      JOIN content_tags ct ON ct.tag_id = t.id
      WHERE ct.content_id = ?
    `);
    return stmt.all(contentId) as Tag[];
  },
};

export const settings = {
  get: (db: Database.Database, key: string) => {
    const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value ?? null;
  },

  set: (db: Database.Database, key: string, value: string) => {
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    );
    return stmt.run(key, value);
  },

  getAll: (db: Database.Database) => {
    const stmt = db.prepare("SELECT * FROM settings");
    return stmt.all() as Array<{ key: string; value: string }>;
  },
};

export const journalPeriods = {
  create: (
    db: Database.Database,
    period: {
      content_id: string;
      period_start: string;
      period_end: string;
      raw_count: number;
      model_used?: string | null;
    }
  ) => {
    const stmt = db.prepare(`
      INSERT INTO journal_periods (content_id, period_start, period_end, raw_count, model_used)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      period.content_id,
      period.period_start,
      period.period_end,
      period.raw_count,
      period.model_used ?? null
    );
  },

  findByContentId: (db: Database.Database, contentId: string) => {
    const stmt = db.prepare(
      "SELECT * FROM journal_periods WHERE content_id = ?"
    );
    return stmt.get(contentId) as JournalPeriod | undefined;
  },
};

export interface SearchResult {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  metadata: string | null;
  is_private: number;
  created_at: string;
  updated_at: string;
  rank: number;
}

export function sanitizeFts5Query(query: string): string {
  // Escape double quotes by doubling them, then wrap each term in quotes
  // to prevent unmatched-quote syntax errors in FTS5.
  // Preserve trailing * for prefix search: hello* -> "hello"*
  // Normalize multiple asterisks to a single prefix operator: test*** -> "test"*
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => {
      const hasPrefix = /\*+$/.test(term);
      const raw = hasPrefix ? term.replace(/\*+$/, "") : term;
      if (!raw) return null;
      const escaped = raw.replace(/"/g, '""');
      const quoted = `"${escaped}"`;
      return hasPrefix ? `${quoted}*` : quoted;
    })
    .filter((term): term is string => term !== null)
    .join(" ");
}

export const search = {
  query: (
    db: Database.Database,
    query: string,
    options?: { limit?: number; offset?: number }
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const stmt = db.prepare(`
      SELECT ci.*, bm25(content_items_search) as rank
      FROM content_items ci
      JOIN content_items_search cis ON ci.rowid = cis.rowid
      WHERE content_items_search MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    return stmt.all(sanitizeFts5Query(query), limit, offset) as SearchResult[];
  },

  queryByType: (
    db: Database.Database,
    query: string,
    type: string,
    options?: { limit?: number; offset?: number }
  ): SearchResult[] => {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const stmt = db.prepare(`
      SELECT ci.*, bm25(content_items_search) as rank
      FROM content_items ci
      JOIN content_items_search cis ON ci.rowid = cis.rowid
      WHERE content_items_search MATCH ? AND ci.type = ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    return stmt.all(
      sanitizeFts5Query(query),
      type,
      limit,
      offset
    ) as SearchResult[];
  },
};

export interface VectorSearchResult {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  metadata: string | null;
  is_private: number;
  created_at: string;
  updated_at: string;
  distance: number;
}

/**
 * Insert or update an embedding for a content item.
 * @param db - Database connection
 * @param contentId - Content item ID
 * @param embedding - Array of float32 values (typically 384 dimensions)
 */
export function upsertEmbedding(
  db: Database.Database,
  contentId: string,
  embedding: number[]
): void {
  // Use a transaction to delete existing then insert new
  const embeddingJson = JSON.stringify(embedding);
  const transaction = db.transaction(() => {
    // First, check if the content item exists
    const contentCheck = db
      .prepare("SELECT rowid FROM content_items WHERE id = ?")
      .get(contentId) as { rowid: number } | undefined;

    if (!contentCheck) {
      return; // Content item doesn't exist, do nothing
    }

    const rowid = contentCheck.rowid;

    // Delete existing embedding if it exists
    db.prepare("DELETE FROM content_vectors WHERE rowid = ?").run(rowid);

    // Insert new embedding with explicit rowid
    // For vec0, we can insert rowid as a parameter
    db.prepare("INSERT INTO content_vectors(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)").run(
      rowid,
      embeddingJson
    );
  });

  transaction();
}

/**
 * Get the embedding for a content item.
 * @param db - Database connection
 * @param contentId - Content item ID
 * @returns Array of float32 values or null if not found
 */
export function getEmbedding(
  db: Database.Database,
  contentId: string
): number[] | null {
  const stmt = db.prepare(`
    SELECT vec_to_json(cv.embedding) as embedding_json
    FROM content_vectors cv
    JOIN content_items ci ON cv.rowid = ci.rowid
    WHERE ci.id = ?
  `);
  const result = stmt.get(contentId) as { embedding_json: string } | undefined;
  if (!result) return null;
  return JSON.parse(result.embedding_json);
}

/**
 * Perform vector similarity search using L2 (Euclidean) distance.
 * @param db - Database connection
 * @param queryEmbedding - Query embedding array
 * @param options - Search options
 * @returns Array of matching content items with distances
 */
export function vectorSearch(
  db: Database.Database,
  queryEmbedding: number[],
  options?: {
    limit?: number;
    type?: string;
  }
): VectorSearchResult[] {
  const k = options?.limit ?? 10;
  const embeddingJson = JSON.stringify(queryEmbedding);

  let sql = `
    SELECT ci.*, v.distance
    FROM content_items ci
    JOIN content_vectors v ON ci.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
    ORDER BY v.distance
  `;

  let params: (string | number)[] = [embeddingJson, k];

  if (options?.type) {
    sql = `
      SELECT ci.*, v.distance
      FROM content_items ci
      JOIN content_vectors v ON ci.rowid = v.rowid
      WHERE v.embedding MATCH ? AND k = ? AND ci.type = ?
      ORDER BY v.distance
    `;
    params = [embeddingJson, k, options.type];
  }

  const stmt = db.prepare(sql);
  return stmt.all(...params) as VectorSearchResult[];
}

/**
 * Delete an embedding for a content item.
 * @param db - Database connection
 * @param contentId - Content item ID
 */
export function deleteEmbedding(
  db: Database.Database,
  contentId: string
): void {
  const stmt = db.prepare(`
    DELETE FROM content_vectors
    WHERE rowid = (SELECT rowid FROM content_items WHERE id = ?)
  `);
  stmt.run(contentId);
}

/**
 * Check if the vec0 extension is loaded and available.
 * @param db - Database connection
 * @returns true if the extension is loaded
 */
export function isVecExtensionLoaded(db: Database.Database): boolean {
  try {
    const result = db
      .prepare("SELECT name FROM pragma_module_list WHERE name = 'vec0'")
      .get() as { name: string } | undefined;
    return result?.name === "vec0";
  } catch {
    return false;
  }
}

/**
 * Get the number of vectors stored in the database.
 * @param db - Database connection
 * @returns Count of vectors
 */
export function getVectorCount(db: Database.Database): number {
  const result = db
    .prepare("SELECT COUNT(*) as count FROM content_vectors")
    .get() as { count: number };
  return result.count;
}
