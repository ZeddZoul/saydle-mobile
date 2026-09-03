import { z } from "zod";

// z.coerce.boolean() treats the string "false" as true, which is a trap.
const bool = (defaultValue) =>
  z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((v) => v === "true");

// A count that has to be a whole positive number. `DELETION_GRACE_DAYS=abc`
// used to become NaN and then an Invalid Date on every purge; now it is a
// boot-time failure with the variable named.
const positiveInt = (defaultValue) => z.coerce.number().int().positive().default(defaultValue);

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
    REFRESH_TOKEN_TTL_DAYS: positiveInt(30),
    // A refresh family rotates forever otherwise: every refresh mints a fresh
    // 30-day token, so a stolen-but-unnoticed session never has to sign in
    // again. This is the ceiling on the whole chain, counted from first login.
    REFRESH_FAMILY_MAX_DAYS: positiveInt(180),

    // Keys the HMAC in the deletion tombstone. Dedicated so that rotating the
    // auth secrets does not silently break matching old tombstones. Falls back
    // to JWT_REFRESH_SECRET outside production (with a warning); required in it.
    TOMBSTONE_HMAC_KEY: z.string().min(32).optional(),

    // Signs the short-lived URLs a private clip is served under — the audio
    // player cannot send a bearer header, so the URL carries its own proof.
    // Same fallback policy as the tombstone key.
    CLIP_SIGNING_SECRET: z.string().min(32).optional(),

    // Outbound email. Unset in development means reset codes are logged rather
    // than sent, so the flow is testable without a provider account. Required
    // in production — see the refinement below.
    RESEND_API_KEY: z.string().optional(),

    // Renders the listening session. Optional on purpose: without it Practice
    // falls back to the device's own speech, which is how it worked before, so
    // a missing key costs the quality of the voice and nothing else.
    ELEVENLABS_API_KEY: z.string().optional(),
    // Characters one reader may have rendered on their behalf per rolling day.
    // Cache hits are free and do not count; this bounds what a single account
    // can bill us for. Seven short lines is ~350 characters, so 5,000 is a
    // fortnight of sessions in a day before the device voice takes over.
    VOICE_DAILY_CHAR_BUDGET: positiveInt(5_000),
    MAIL_FROM: z.string().default("Saydle <noreply@saydle.app>"),

    CORS_ORIGIN: z.string().default(""),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // --- RevenueCat ---------------------------------------------------------
    // The entitlement identifier, which must equal the one in the dashboard.
    REVENUECAT_ENTITLEMENT_ID: z.string().min(1).default("premium"),
    // Read per call in config/subscription.js so the "wrong secret" case is
    // testable; declared here only so production can warn when it is unset.
    REVENUECAT_WEBHOOK_SECRET: z.string().optional(),

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
    AI_CACHE_TTL_SECONDS: positiveInt(3600),
    // Generous because generation is background work that nothing waits on —
    // the read path was split away from it precisely so this can be slow. A
    // 240-line batch measured 44-68s; 30s silently aborted every one of them.
    AI_TIMEOUT_MS: positiveInt(120_000),
    // Measured, not guessed. A 240-line batch needs ~7k visible tokens, and the
    // cap has to cover thinking too — it is spent from the same budget. 4096
    // silently truncated to an EMPTY candidate, which reads as "blocked".
    AI_MAX_OUTPUT_TOKENS: positiveInt(16_384),
    // Thinking is billed as output and dominated the bill: ~4200 tokens on a
    // 240-line batch uncapped, 773 capped — same batch, 24s faster, no loss in
    // moderation pass rate. 0 disables the cap and lets the model think freely.
    AI_THINKING_BUDGET: z.coerce.number().int().min(0).default(1024),

    // --- Feed --------------------------------------------------------------
    // Keep at least this many future days scheduled per active user, so the
    // phone always has something to cache for offline use.
    FEED_BUFFER_DAYS: positiveInt(14),
    // Ceiling on how much a single sync request may pull down.
    FEED_MAX_SYNC_DAYS: z.coerce.number().int().positive().max(120).default(30),

    // --- Library -----------------------------------------------------------
    // The reasoning behind each number lives in config/library.js; this is
    // only where they are parsed.
    LIBRARY_BATCH_SIZE: positiveInt(240),
    LIBRARY_REFILL_BELOW: positiveInt(40),
    LIBRARY_STALE_DAYS: positiveInt(6),
    LIBRARY_DRIFT_PERCENT: z.coerce.number().int().min(0).max(100).default(50),
    LIBRARY_PAGE_SIZE: positiveInt(40),

    // --- Deletion ----------------------------------------------------------
    // Policy in config/deletion.js; parsed here so a typo fails at boot.
    DELETION_GRACE_DAYS: positiveInt(30),
    DELETION_REMINDER_DAYS: positiveInt(5),
    BILLING_RETENTION_YEARS: positiveInt(6),
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

    if (cfg.NODE_ENV !== "production") return;

    // Everything below is a production-only requirement. In development and
    // test each has a fallback that is fine on a laptop and unacceptable on a
    // host: reset codes in the logs, an HMAC keyed on an auth secret, a clip
    // URL signed with the access-token key.
    const required = [
      [
        "RESEND_API_KEY",
        "Required in production: without it reset codes would be logged, not sent.",
      ],
      [
        "TOMBSTONE_HMAC_KEY",
        "Required in production so rotating auth secrets cannot orphan tombstones.",
      ],
      [
        "CLIP_SIGNING_SECRET",
        "Required in production; private clip URLs must not be signed with an auth secret.",
      ],
    ];

    for (const [key, message] of required) {
      if (!cfg[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
    }

    if (cfg.DELETION_REMINDER_DAYS >= cfg.DELETION_GRACE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DELETION_REMINDER_DAYS"],
        message:
          "Must be smaller than DELETION_GRACE_DAYS, or the reminder goes out after the purge.",
      });
    }
  });

/**
 * Parse one environment. Exported so the boot guards are testable without
 * spawning a process: the module-level call below is what the server uses.
 *
 * Returns `{ env, warnings }` or throws an Error whose message lists every
 * issue, one per line, in the shape the boot path prints.
 */
export function parseEnv(source) {
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const cfg = parsed.data;

  if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.");
  }

  // Loud rather than fatal: each of these is a working configuration with a
  // sharp edge, and the edge is worth naming in the boot log.
  const warnings = [];
  const production = cfg.NODE_ENV === "production";

  if (production && !cfg.REVENUECAT_WEBHOOK_SECRET) {
    warnings.push(
      "REVENUECAT_WEBHOOK_SECRET is unset: the subscription webhook will refuse every event, so nobody can become entitled.",
    );
  }
  if (!production && !cfg.TOMBSTONE_HMAC_KEY) {
    warnings.push(
      "TOMBSTONE_HMAC_KEY is unset: falling back to JWT_REFRESH_SECRET. Required in production.",
    );
  }
  if (!production && !cfg.CLIP_SIGNING_SECRET) {
    warnings.push(
      "CLIP_SIGNING_SECRET is unset: falling back to JWT_ACCESS_SECRET. Required in production.",
    );
  }

  return { env: cfg, warnings };
}

let booted;
try {
  booted = parseEnv(process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

export const env = booted.env;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

// The logger imports this module, so the boot warnings go straight to stderr.
// Silent under test: every suite would otherwise print the same two lines.
if (!isTest) {
  for (const warning of booted.warnings) console.warn(`[env] ${warning}`);
}

/** The key the deletion tombstone HMAC is computed with. */
export const tombstoneKey = env.TOMBSTONE_HMAC_KEY ?? env.JWT_REFRESH_SECRET;

/** The key private clip URLs are signed with. */
export const clipSigningKey = env.CLIP_SIGNING_SECRET ?? env.JWT_ACCESS_SECRET;

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
