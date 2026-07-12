import Database from "better-sqlite3";

export interface ApiTokenRow {
  id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  last_used_ip: string | null;
  is_revoked: number;
}

export const apiTokens = {
  create: (
    db: Database.Database,
    row: {
      id: string;
      name: string;
      token_prefix: string;
      token_hash: string;
      created_at: string;
    }
  ): void => {
    const stmt = db.prepare(`
      INSERT INTO api_tokens (id, name, token_prefix, token_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      row.id,
      row.name,
      row.token_prefix,
      row.token_hash,
      row.created_at
    );
  },

  findByPrefix: (db: Database.Database, prefix: string): ApiTokenRow[] => {
    const stmt = db.prepare(
      "SELECT * FROM api_tokens WHERE token_prefix = ? AND is_revoked = 0"
    );
    return stmt.all(prefix) as ApiTokenRow[];
  },

  listAll: (db: Database.Database): ApiTokenRow[] => {
    const stmt = db.prepare(
      "SELECT * FROM api_tokens ORDER BY created_at DESC"
    );
    return stmt.all() as ApiTokenRow[];
  },

  revoke: (db: Database.Database, id: string): void => {
    const stmt = db.prepare(
      "UPDATE api_tokens SET is_revoked = 1 WHERE id = ?"
    );
    stmt.run(id);
  },

  recordUsage: (db: Database.Database, id: string, ip: string | null): void => {
    const stmt = db.prepare(
      "UPDATE api_tokens SET last_used_at = ?, last_used_ip = ? WHERE id = ?"
    );
    stmt.run(new Date().toISOString(), ip, id);
  },
};
