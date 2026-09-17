import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/config/env.js";

/**
 * The boot guards.
 *
 * `parseEnv` is the same function the server runs against process.env at
 * import, exported so these can hand it an environment rather than spawn a
 * process. What matters is that a production host with a missing key, or a
 * tunable set to nonsense, dies at boot with the variable named — not three
 * days later as a 500 or an Invalid Date.
 */

const secret = (tag) => `${tag}-secret-that-is-long-enough-to-pass-0000000`;

const base = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/x",
  JWT_ACCESS_SECRET: secret("access"),
  JWT_REFRESH_SECRET: secret("refresh"),
  AI_ENABLED: "false",
};

const production = {
  ...base,
  NODE_ENV: "production",
  RESEND_API_KEY: "re_x",
  TOMBSTONE_HMAC_KEY: secret("tombstone"),
  CLIP_SIGNING_SECRET: secret("clip"),
  REVENUECAT_WEBHOOK_SECRET: "rc",
};

describe("parseEnv", () => {
  it("accepts a minimal development configuration", () => {
    const { env } = parseEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.DELETION_GRACE_DAYS).toBe(30);
    expect(env.VOICE_DAILY_CHAR_BUDGET).toBe(5000);
  });

  it("refuses production without a mail provider", () => {
    const { RESEND_API_KEY, ...without } = production;
    void RESEND_API_KEY;
    expect(() => parseEnv(without)).toThrow(/RESEND_API_KEY/);
  });

  it("refuses production without the dedicated tombstone key", () => {
    const { TOMBSTONE_HMAC_KEY, ...without } = production;
    void TOMBSTONE_HMAC_KEY;
    expect(() => parseEnv(without)).toThrow(/TOMBSTONE_HMAC_KEY/);
  });

  it("refuses production without a clip signing secret", () => {
    const { CLIP_SIGNING_SECRET, ...without } = production;
    void CLIP_SIGNING_SECRET;
    expect(() => parseEnv(without)).toThrow(/CLIP_SIGNING_SECRET/);
  });

  it("accepts a complete production configuration, quietly", () => {
    const { warnings } = parseEnv(production);
    expect(warnings).toEqual([]);
  });

  it("warns, loudly, when the webhook secret is missing in production", () => {
    const { REVENUECAT_WEBHOOK_SECRET, ...without } = production;
    void REVENUECAT_WEBHOOK_SECRET;

    // Not fatal — the webhook fails closed on its own — but a host where
    // nobody can ever become entitled deserves a line in the boot log.
    const { warnings } = parseEnv(without);
    expect(warnings.join("\n")).toMatch(/REVENUECAT_WEBHOOK_SECRET/);
  });

  it("names the fallback keys it is using outside production", () => {
    const { warnings } = parseEnv(base);
    expect(warnings.join("\n")).toMatch(/TOMBSTONE_HMAC_KEY/);
    expect(warnings.join("\n")).toMatch(/CLIP_SIGNING_SECRET/);
  });

  it("refuses a tunable that is not a number", () => {
    // Used to become NaN, then an Invalid Date on the day of a purge.
    expect(() => parseEnv({ ...base, DELETION_GRACE_DAYS: "abc" })).toThrow(
      /DELETION_GRACE_DAYS/,
    );
    expect(() => parseEnv({ ...base, LIBRARY_BATCH_SIZE: "lots" })).toThrow(
      /LIBRARY_BATCH_SIZE/,
    );
    expect(() => parseEnv({ ...base, BILLING_RETENTION_YEARS: "0" })).toThrow(
      /BILLING_RETENTION_YEARS/,
    );
    expect(() => parseEnv({ ...base, VOICE_DAILY_CHAR_BUDGET: "-5" })).toThrow(
      /VOICE_DAILY_CHAR_BUDGET/,
    );
  });

  it("parses the tunables it accepts", () => {
    const { env } = parseEnv({ ...base, DELETION_GRACE_DAYS: "7", LIBRARY_PAGE_SIZE: "20" });
    expect(env.DELETION_GRACE_DAYS).toBe(7);
    expect(env.LIBRARY_PAGE_SIZE).toBe(20);
  });

  it("refuses a reminder that would go out after the purge", () => {
    expect(() =>
      parseEnv({ ...production, DELETION_GRACE_DAYS: "5", DELETION_REMINDER_DAYS: "5" }),
    ).toThrow(/DELETION_REMINDER_DAYS/);
  });

  it("still refuses identical auth secrets", () => {
    expect(() => parseEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /different/,
    );
  });
});
