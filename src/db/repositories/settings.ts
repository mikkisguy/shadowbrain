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

  /**
   * Idempotent insert — silently skip on a `key` collision, leaving
   * the existing value untouched. Mirrors `contentItems.createOrIgnore`
   * / `journalPeriods.createOrIgnore` so bulk-import paths (e.g.
   * the journal-shadows migration) can be re-run without
   * overwriting values the user has since updated in the new app.
   *
   * Use {@link set} when you actually want the new value to win on
   * collision.
   */
  createOrIgnore: (
    db: Database.Database,
    row: { key: string; value: string }
  ) => {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
    );
    return stmt.run(row.key, row.value);
  },
};
