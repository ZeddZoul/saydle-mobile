import { z } from "zod";
import { THEME_SLUGS } from "../config/themes.js";
import { SUPPORTED_LOCALES } from "../config/locales.js";

export const feedQuerySchema = z
  .object({
    // The client asks for as much as it wants to hold offline; the service
    // clamps to FEED_MAX_SYNC_DAYS.
    days: z.coerce.number().int().min(1).max(120).default(30),
  })
  .strip();

export const historyQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(120).default(30),
    // Cursor for paging further back, as the reader keeps scrolling.
    before: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
      .optional(),
  })
  .strip();

export const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
});

export const customAffirmationSchema = z
  .object({
    // Longer than a generated line's 100: this is someone's own sentence, and
    // holding them to our brevity rule would be correcting their voice.
    text: z
      .string()
      .trim()
      .min(3, "Write a little more than that.")
      .max(200, "Keep it under 200 characters."),
    categorySlug: z.string().max(40).optional(),
  })
  .strict();

export const idParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Not a valid id."),
});

// "HH:MM" on a 24-hour clock, in the device's local time.
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must look like 08:30.");

export const preferencesSchema = z
  .object({
    categories: z.array(z.string().max(40)).max(10).optional(),
    tone: z.enum(["gentle", "grounded", "energetic"]).optional(),
    focus: z.string().max(500).optional(),
    useFirstName: z.boolean().optional(),
    theme: z.enum(THEME_SLUGS).optional(),
    // The gate: a locale is only accepted once it has moderation rules and a
    // curated bank. Anything else is a 400, not a silent fallback — a reader who
    // asked for a language should be told we don't have it.
    locale: z.enum(SUPPORTED_LOCALES).optional(),
    timezone: z.string().max(64).optional(),
    reminders: z
      .object({
        enabled: z.boolean(),
        // Capped: every extra reminder multiplies what the device schedules, and
        // iOS drops pending notifications past a hard limit.
        count: z.number().int().min(0).max(20),
        start: clockTime,
        end: clockTime,
      })
      .strict()
      .refine((r) => r.start < r.end, {
        message: "The end time must be after the start time.",
        path: ["end"],
      })
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });
