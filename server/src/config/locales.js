/**
 * The languages Saydle will generate affirmations in.
 *
 * This is a GATE, not a preference. Generated affirmations pass through a
 * deterministic safety layer (services/moderation.service.js) whose rules are
 * per-language: the forbidden-topic patterns and the first-person check are
 * literal words. A language with no rules would sail past every check, so a
 * language ships only once it has all three of:
 *
 *   1. moderation rules in moderation.service.js,
 *   2. a curated fallback bank in data/curated.js (used on outage/rejection),
 *   3. a locale file in the app (locales/<code>.json).
 *
 * Keep this in sync with SUPPORTED_LOCALES in the mobile lib/i18n.js.
 */
export const SUPPORTED_LOCALES = ["en", "es"];

export const DEFAULT_LOCALE = "en";

/** Written out for the generation prompt, which needs a name not a code. */
export const LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish",
};

/** Endonyms, for a language picker that reads in the language it offers. */
export const LANGUAGE_ENDONYMS = {
  en: "English",
  es: "Español",
};

export const isSupportedLocale = (locale) => SUPPORTED_LOCALES.includes(locale);

export const resolveLocale = (locale) =>
  isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
