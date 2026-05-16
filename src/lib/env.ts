import { z } from "zod";

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DOMAIN: z.string().default("localhost:3000"),
  PORT: z.coerce.number().default(3000),

  // Database
  DATA_DIR: z.string().default("./data"),

  // Discord
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_JOURNAL_CHANNEL_ID: z.string().optional(),

  // AI (OpenRouter)
  OPENROUTER_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("mistralai/mistral-7b-instruct"),

  // Embeddings
  EMBEDDING_MODEL: z.string().default("all-MiniLM-L6-v2"),

  // Auth
  SESSION_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate environment variables.
 * Caches the result — subsequent calls return the same object.
 * Throws at runtime if validation fails.
 */
export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `Invalid environment variables:\n${errors.join("\n")}\n\nCheck .env.template for required values.`
    );
  }

  _env = result.data;
  return _env;
}

/**
 * Validate that specific env vars required for a feature are present.
 * Returns an error message if any are missing, or null if all are present.
 */
export function requireEnvVars(
  vars: (keyof Env)[],
  feature: string
): string | null {
  const env = getEnv();
  const missing = vars.filter((v) => !env[v]);
  if (missing.length === 0) return null;
  return `Missing environment variable(s) for ${feature}: ${missing.join(", ")}. Add them to your .env file.`;
}
