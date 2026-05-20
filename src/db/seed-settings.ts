import type Database from "better-sqlite3";
import { type Env, getEnv } from "@/lib/env";

/**
 * Environment variables that map to settings keys.
 * When set, they override the database defaults from migration 0001.
 */
const ENV_TO_SETTINGS = {
  OPENROUTER_API_KEY: "openrouter_api_key",
  AI_MODEL: "ai_model",
  EMBEDDING_MODEL: "embedding_model",
  DISCORD_BOT_TOKEN: "discord_bot_token",
  DISCORD_GUILD_ID: "discord_guild_id",
  DISCORD_JOURNAL_CHANNEL_ID: "discord_journal_channel_id",
} as const satisfies Partial<Record<keyof Env, string>>;

const PLACEHOLDER_VALUES = new Set([
  "your-api-key",
  "your-bot-token",
  "your-channel-id",
  "your-guild-id",
]);

function isPlaceholderValue(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.trim());
}

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
      const value = env[envKey as keyof Env];
      if (typeof value !== "string") {
        continue;
      }

      const normalizedValue = value.trim();

      if (
        normalizedValue !== "" &&
        !isPlaceholderValue(normalizedValue)
      ) {
        insert.run(settingsKey, normalizedValue);
      }
    }
  });

  batch();

  const count = db.prepare("SELECT COUNT(*) as n FROM settings").get() as {
    n: number;
  };
  console.log(`✓ Settings seeded (${count.n} rows)`);
}
