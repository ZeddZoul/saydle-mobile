import { z } from "zod";

// z.coerce.boolean() treats the string "false" as true, which is a trap.
const bool = (defaultValue) =>
  z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((v) => v === "true");

// Validated once at boot. A missing or malformed var should crash the process here,
// loudly, rather than surface as a confusing 500 three days from now.
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),

    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    // Outbound email. Unset in development means reset codes are logged rather
    // than sent, so the flow is testable without a provider account.
    RESEND_API_KEY: z.string().optional(),

    // Renders the listening session. Optional on purpose: without it Practice
    // falls back to the device's own speech, which is how it worked before, so
    // a missing key costs the quality of the voice and nothing else.
    ELEVENLABS_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().default("Saydle <noreply@saydle.app>"),

    CORS_ORIGIN: z.string().default(""),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // --- Vertex AI ---------------------------------------------------------
    // When false the app runs entirely on the curated affirmation bank. This is
    // the switch to flip if Vertex is misbehaving in production.
    AI_ENABLED: bool(true),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    GOOGLE_CLOUD_LOCATION: z.string().default("us-central1"),
    VERTEX_MODEL: z.string().default("gemini-2.5-flash"),
    // Explicit context caching bills per token-hour whether or not you hit it.
    // Leave off until steady traffic justifies it; implicit caching applies for
    // 2.5 models regardless, at no storage cost.
    AI_EXPLICIT_CACHE: bool(false),
    AI_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    // Generous because generation is background work that nothing waits on —
    // the read path was split away from it precisely so this can be slow. A
    // 240-line batch measured 44-68s; 30s silently aborted every one of them.
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    // Measured, not guessed. A 240-line batch needs ~7k visible tokens, and the
    // cap has to cover thinking too — it is spent from the same budget. 4096
    // silently truncated to an EMPTY candidate, which reads as "blocked".
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(16_384),
    // Thinking is billed as output and dominated the bill: ~4200 tokens on a
    // 240-line batch uncapped, 773 capped — same batch, 24s faster, no loss in
    // moderation pass rate. 0 disables the cap and lets the model think freely.
    AI_THINKING_BUDGET: z.coerce.number().int().min(0).default(1024),

    // --- Feed --------------------------------------------------------------
    // Keep at least this many future days scheduled per active user, so the
    // phone always has something to cache for offline use.
    FEED_BUFFER_DAYS: z.coerce.number().int().positive().default(14),
    // Ceiling on how much a single sync request may pull down.
    FEED_MAX_SYNC_DAYS: z.coerce.number().int().positive().max(120).default(30),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.AI_ENABLED && !cfg.GOOGLE_CLOUD_PROJECT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_CLOUD_PROJECT"],
        message:
          "Required when AI_ENABLED=true. Set it, or set AI_ENABLED=false to run on the curated bank only.",
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  console.error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.");
  process.exit(1);
}

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
