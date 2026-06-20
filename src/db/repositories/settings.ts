import Database from "better-sqlite3";

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
