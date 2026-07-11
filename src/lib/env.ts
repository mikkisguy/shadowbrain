import { z } from "zod";

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test", "e2e"])
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
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters long"),
  // Single-user admin. Username is required. The password is *not* the
  // plaintext — it is a bcrypt hash (cost >= 10). The app compares the
  // user's submitted password against this hash at login time.
  ADMIN_USERNAME: z.string().min(1, "ADMIN_USERNAME is required"),
  ADMIN_PASSWORD_HASH: z
    .string()
    .min(1, "ADMIN_PASSWORD_HASH is required (bcrypt hash, cost >= 10)"),
  // Optional. Session lifetime in milliseconds. Clamped to [1h, 30d]
  // at runtime by getSessionMaxAge(); invalid or out-of-range values
  // fall back to 24h. See src/lib/auth/session.ts.
  SESSION_MAX_AGE: z.coerce.number().int().positive().optional(),

  // Optional. The HTTP header that carries the real client IP when the
  // app runs behind a trusted reverse proxy (e.g. nginx setting
  // `proxy_set_header X-Forwarded-For $remote_addr;`). The rate
  // limiter and audit log read the client IP from this header. The
  // deployment must set the header and the app must trust it; if the
  // app is exposed without a trusted proxy, the IP falls back to
  // `"unknown"` and every request lands in the same bucket. See
  // `src/lib/auth/client-ip.ts` and the App Security Baseline design
  // spec §5. Default: X-Forwarded-For.
  TRUSTED_PROXY_HEADER: z.string().default("X-Forwarded-For"),

  // Chat RAG
  // Number of content items to retrieve for RAG grounding context.
  // Default: 8. See docs/superpowers/specs/2026-06-19-chat-interface-design.md.
  CHAT_RAG_TOP_K: z.coerce.number().int().min(1).max(50).default(8),

  // Image capture
  WEBP_QUALITY: z.coerce.number().int().min(1).max(100).default(95),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
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
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `Invalid environment variables: ${errors.join(
        "; "
      )}. Check .env.template for required values.`
    );
  }

  _env = result.data;
  return _env;
}
