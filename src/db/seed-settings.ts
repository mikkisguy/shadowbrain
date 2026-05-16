import type Database from "better-sqlite3";
import { getEnv } from "@/lib/env";

/**
 * Environment variables that map to settings keys.
 * When set, they override the database defaults from migration 0001.
 */
const ENV_TO_SETTINGS: Record<string, string> = {
  AI_MODEL: "ai_model",
  EMBEDDING_MODEL: "embedding_model",
};

/**
 * Seed the settings table from environment variables (first-boot only).
 * Only inserts when the key doesn't already exist — runtime changes via
 * settings.set() persist across restarts. Env vars act as initial defaults.
 */
export function seedSettings(db: Database.Database): void {
  const env = getEnv();

  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );

  const batch = db.transaction(() => {
    for (const [envKey, settingsKey] of Object.entries(ENV_TO_SETTINGS)) {
      const value = env[envKey as keyof typeof env];
      if (value !== undefined && value !== "") {
        insert.run(settingsKey, value);
      }
    }
  });

  batch();

  const count = db.prepare("SELECT COUNT(*) as n FROM settings").get() as {
    n: number;
  };
  console.log(`✓ Settings seeded (${count.n} rows)`);
}
