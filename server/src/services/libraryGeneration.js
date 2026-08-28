import { Affirmation } from "../models/Affirmation.js";
import { logger } from "../lib/logger.js";
import { generateAffirmations, AiUnavailableError } from "./vertex.service.js";
import { filterAffirmations, focusNeedsCare } from "./moderation.service.js";
import { profileNeedsCare, FREE_TEXT_FIELDS } from "../config/profileFields.js";
import { LANGUAGE_NAMES, resolveLocale } from "../config/locales.js";
import { PROMPT_VERSION } from "../prompts/affirmation.prompt.js";

/**
 * One batch for the scrollable library.
 *
 * Every safety property the daily path has applies here unchanged, and for a
 * sharper reason: this writes two hundred and forty lines at once against
 * somebody's stated struggles. A screen that is merely *usually* applied is not
 * a screen.
 *
 * Separate from `affirmation.service`'s `tryGenerate` because the two want
 * different things — that one tops up a small pool to fill specific dates, this
 * one writes a large ordered batch nobody is waiting on — and entangling them
 * would put the daily feed's timing at the mercy of a 60-second call.
 */
export async function generateForLibrary(user, count) {
  const prefs = user.preferences ?? {};
  const locale = resolveLocale(user.locale);

  // A stated focus that touches crisis or clinical ground is never sent to the
  // model and never generated against. Unlike the daily path this does not bail
  // out entirely — the reader still gets a library, written generally and
  // gently, rather than an empty screen.
  const risky = focusNeedsCare(prefs.focus, locale);
  const focus = risky ? "" : prefs.focus;

  const freeTextNeedsCare = FREE_TEXT_FIELDS.some((f) =>
    focusNeedsCare(user.profile?.[f.key], locale),
  );
  const gentle = risky || profileNeedsCare(user.profile) || freeTextNeedsCare;

  if (risky) logger.info({ userId: user.id }, "library focus withheld from the model");

  const recent = await Affirmation.find({ user: user._id }, { text: 1 })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();

  let raw;
  try {
    raw = await generateAffirmations({
      count,
      categories: prefs.categories ?? [],
      tone: prefs.tone,
      displayName: prefs.useFirstName ? user.firstName : null,
      focus,
      avoid: recent.map((r) => r.text),
      profile: user.profile ?? {},
      gentle,
      screenText: (text) => !focusNeedsCare(text, locale),
      language: LANGUAGE_NAMES[locale],
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      // The reader keeps the batch they already have. There is no curated
      // fallback here on purpose: padding a personal library with generic bank
      // lines would quietly make the premium feature worse than the free one.
      logger.warn({ userId: user.id, err: err.message }, "library generation unavailable");
      return [];
    }
    throw err;
  }

  const { approved, rejected } = filterAffirmations(raw, locale);

  if (rejected.length > 0) {
    logger.warn(
      { userId: user.id, rejected: rejected.length, reasons: rejected.map((r) => r.reason) },
      "library lines rejected by moderation",
    );
  }

  if (approved.length === 0) return [];

  const allowed = prefs.categories?.length ? prefs.categories : null;

  /**
   * Re-rank after moderation, not before.
   *
   * The model ranks what it wrote; moderation then drops some of it. Keeping
   * the original numbers would leave gaps — a session asking for ranks 1-7 and
   * finding 1, 3, 4, 7 — so the survivors are renumbered in the order the model
   * put them. Its judgement about *which* lines and in *what order* survives;
   * only the arithmetic is redone.
   */
  const ranked = approved
    .filter((a) => Number.isInteger(a.practiceRank))
    .sort((a, b) => a.practiceRank - b.practiceRank)
    .slice(0, 7);

  const rankOf = new Map(ranked.map((a, i) => [a.text, i + 1]));

  const docs = approved.map((a) => ({
    text: a.text,
    practiceRank: rankOf.get(a.text) ?? null,
    textKey: a.text.trim().toLowerCase(),
    categorySlug:
      allowed && allowed.includes(a.category) ? a.category : (a.category ?? "general"),
    source: "generated",
    user: user._id,
    locale,
    promptVersion: PROMPT_VERSION,
    library: true,
  }));

  // Unordered: a line the model happened to repeat costs itself, not the batch.
  const inserted = await Affirmation.insertMany(docs, {
    ordered: false,
    rawResult: false,
  }).catch((err) => {
    if (err?.code === 11000 || err?.writeErrors) return err.insertedDocs ?? [];
    throw err;
  });

  return inserted;
}
