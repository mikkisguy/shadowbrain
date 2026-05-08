import Database from 'better-sqlite3';
import { join } from 'path';
import { runMigrations } from './migrations';

const DB_PATH = join(process.cwd(), 'shadowbrain.db');

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export const contentItems = {
  create: (db: Database.Database, item: {
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
  }) => {
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
      item.source ?? 'manual',
      item.source_url ?? null,
      item.metadata ?? null,
      item.is_private ?? 0,
      item.created_at,
      item.updated_at
    );
  },

  findById: (db: Database.Database, id: string) => {
    const stmt = db.prepare('SELECT * FROM content_items WHERE id = ?');
    return stmt.get(id) as any;
  },

  findAll: (db: Database.Database, options?: { type?: string; limit?: number; offset?: number }) => {
    let sql = 'SELECT * FROM content_items';
    const params: any[] = [];

    if (options?.type) {
      sql += ' WHERE type = ?';
      params.push(options.type);
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = db.prepare(sql);
    return stmt.all(...params) as any[];
  },

  update: (db: Database.Database, id: string, updates: {
    title?: string;
    content?: string;
    metadata?: string;
    updated_at: string;
  }) => {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      params.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      params.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      params.push(updates.metadata);
    }

    fields.push('updated_at = ?');
    params.push(updates.updated_at);
    params.push(id);

    const stmt = db.prepare(`UPDATE content_items SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...params);
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare('DELETE FROM content_items WHERE id = ?');
    return stmt.run(id);
  },
};

export const contentLinks = {
  create: (db: Database.Database, link: {
    id: string;
    source_id: string;
    target_id: string;
    link_type?: string;
    context?: string | null;
    created_at: string;
  }) => {
    const stmt = db.prepare(`
      INSERT INTO content_links (id, source_id, target_id, link_type, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      link.id,
      link.source_id,
      link.target_id,
      link.link_type ?? 'reference',
      link.context ?? null,
      link.created_at
    );
  },

  findBySource: (db: Database.Database, sourceId: string) => {
    const stmt = db.prepare('SELECT * FROM content_links WHERE source_id = ?');
    return stmt.all(sourceId) as any[];
  },

  findByTarget: (db: Database.Database, targetId: string) => {
    const stmt = db.prepare('SELECT * FROM content_links WHERE target_id = ?');
    return stmt.all(targetId) as any[];
  },

  delete: (db: Database.Database, id: string) => {
    const stmt = db.prepare('DELETE FROM content_links WHERE id = ?');
    return stmt.run(id);
  },
};

export const tags = {
  create: (db: Database.Database, tag: { id: string; name: string; color?: string | null; created_at: string }) => {
    const stmt = db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)');
    return stmt.run(tag.id, tag.name, tag.color ?? null, tag.created_at);
  },

  findAll: (db: Database.Database) => {
    const stmt = db.prepare('SELECT * FROM tags ORDER BY name');
    return stmt.all() as any[];
  },

  findByName: (db: Database.Database, name: string) => {
    const stmt = db.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE');
    return stmt.get(name) as any;
  },

  findById: (db: Database.Database, id: string) => {
    const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
    return stmt.get(id) as any;
  },
};

export const contentTags = {
  addTag: (db: Database.Database, contentId: string, tagId: string, createdAt: string) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO content_tags (content_id, tag_id, created_at) VALUES (?, ?, ?)');
    return stmt.run(contentId, tagId, createdAt);
  },

  removeTag: (db: Database.Database, contentId: string, tagId: string) => {
    const stmt = db.prepare('DELETE FROM content_tags WHERE content_id = ? AND tag_id = ?');
    return stmt.run(contentId, tagId);
  },

  findByContent: (db: Database.Database, contentId: string) => {
    const stmt = db.prepare(`
      SELECT t.* FROM tags t
      JOIN content_tags ct ON ct.tag_id = t.id
      WHERE ct.content_id = ?
    `);
    return stmt.all(contentId) as any[];
  },
};

export const settings = {
  get: (db: Database.Database, key: string) => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value ?? null;
  },

  set: (db: Database.Database, key: string, value: string) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    return stmt.run(key, value);
  },

  getAll: (db: Database.Database) => {
    const stmt = db.prepare('SELECT * FROM settings');
    return stmt.all() as Array<{ key: string; value: string }>;
  },
};

export const journalPeriods = {
  create: (db: Database.Database, period: {
    content_id: string;
    period_start: string;
    period_end: string;
    raw_count: number;
    model_used?: string | null;
  }) => {
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
    const stmt = db.prepare('SELECT * FROM journal_periods WHERE content_id = ?');
    return stmt.get(contentId) as any;
  },
};
