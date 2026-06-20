import Database from "better-sqlite3";

export interface JournalPeriod {
  content_id: string;
  period_start: string;
  period_end: string;
  raw_count: number;
  model_used: string | null;
}

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
