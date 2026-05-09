import Database from "better-sqlite3";
import { join, resolve } from "path";
import { runMigrations } from "./migrations";

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
  const dataDir = process.env.DATA_DIR
    ? resolve(process.env.DATA_DIR)
    : join(__dirname, "..", "..");
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

  if (migrate) {
    runMigrations(db);
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

    return stmt.all(query, limit, offset) as SearchResult[];
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

    return stmt.all(query, type, limit, offset) as SearchResult[];
  },
};
