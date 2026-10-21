import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("file:./.pgdata"),
  AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-4f8a1c92e7b3d5a6c0f1e2d3b4a59687"),
  ENCRYPTION_KEY: z.string().min(16).default("dev-only-32-byte-key-0123456789abcdef"),
  // ---- Model backends -------------------------------------------------
  // OpenAI is optional. Any of the providers below works, several have a
  // free tier, and Ollama runs locally for zero cost. See README → Free AI models.
  AI_PROVIDER: z
    .enum(["auto", "openai", "openrouter", "groq", "gemini", "ollama", "custom"])
    .default("auto"),
  AI_MODEL: z.string().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  MICROSOFT_CLIENT_ID: z.string().optional().default(""),
  MICROSOFT_CLIENT_SECRET: z.string().optional().default(""),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  REDIS_URL: z.string().optional().default(""),
  DEMO_MODE: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  STORAGE_DIR: z.string().default("./storage"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("✖ Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  throw new Error("Invalid environment configuration. Copy .env.example to .env and fill it in.");
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";

/** True when the user pointed Ollama somewhere explicitly (or asked for it by name). */
export const ollamaEnabled =
  env.AI_PROVIDER === "ollama" || Boolean(process.env.OLLAMA_BASE_URL?.trim());

/**
 * True when a real model backend is configured; otherwise the agents run on the
 * deterministic local engine. Note this is deliberately optimistic for Ollama:
 * `complete()` probes the daemon and degrades to the local engine if it is down.
 */
export const aiConfigured = Boolean(
  env.OPENAI_API_KEY ||
    env.OPENROUTER_API_KEY ||
    env.GROQ_API_KEY ||
    env.GEMINI_API_KEY ||
    ollamaEnabled,
);

/** True when Gmail OAuth credentials exist (connection flow is fully functional). */
export const gmailConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** True when Microsoft Graph OAuth credentials exist. */
export const outlookConfigured = Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);

/** True when a Redis instance is available for BullMQ; otherwise the DB-backed worker runs. */
export const redisConfigured = Boolean(env.REDIS_URL);

export const integrationStatus = {
  ai: aiConfigured,
  gmail: gmailConfigured,
  outlook: outlookConfigured,
  redis: redisConfigured,
};

export const DEMO_MODE = env.DEMO_MODE;
