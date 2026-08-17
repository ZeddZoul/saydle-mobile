import { User } from "../models/User.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { generateAffirmations } from "./vertex.service.js";
import { filterAffirmations, focusNeedsCare } from "./moderation.service.js";
import { profileNeedsCare } from "../config/profileFields.js";
import { resolveLocale, LANGUAGE_NAMES } from "../config/locales.js";
import { curatedFor } from "../data/curated.js";

/**
 * One affirmation, written for this person, shown on the paywall.
 *
 * The deliberate exception to "never spend model time on a free account".
 * Everywhere else that rule holds absolutely — but a promise that Saydle will
 * write for you is worth far less than one sentence proving it, with their name
 * in it, about the thing they actually told us they were working on.
 *
 * The economics make it easy: one call, once, at registration, cached on the
 * user forever. Fractions of a cent per account, against a subscription. The
 * unbounded thing is a *daily* feed per head, which is exactly what stays
 * behind the paywall.
 *
 * Never regenerated. A second call would double a cost that buys nothing — the
 * point is to have one honest example, not a fresh one.
 */
export async function ensureSampleLine(user, { force = false } = {}) {
  if (!force && user.sampleLine) return user.sampleLine;

  const locale = resolveLocale(user.locale);

  if (!env.AI_ENABLED) {
    // No model configured (local dev, CI). A curated line is a poor sample —
    // it is not personal — so we simply have none rather than pretend.
    return null;
  }

  try {
    const prefs = user.preferences ?? {};
    const focus = focusNeedsCare(prefs.focus, locale) ? "" : prefs.focus;

    // Ask for three and keep the first that passes. One request that comes back
    // rejected would leave the paywall with nothing, and this only ever runs
    // once per account.
    const raw = await generateAffirmations({
      count: 3,
      categories: prefs.categories ?? [],
      tone: prefs.tone,
      displayName: prefs.useFirstName ? user.firstName : null,
      focus,
      avoid: [],
      profile: user.profile ?? {},
      gentle: profileNeedsCare(user.profile),
      screenText: (text) => !focusNeedsCare(text, locale),
      language: LANGUAGE_NAMES[locale],
    });

    // Held to the same screen as everything else. A sample is the first
    // sentence some people ever read from us; it cannot be the one that slips.
    const { approved } = filterAffirmations(raw ?? [], locale);
    const [safe] = approved;
    if (!safe) return null;

    const text = typeof safe === "string" ? safe : safe.text;

    await User.updateOne({ _id: user._id }, { $set: { sampleLine: text } });
    user.sampleLine = text;

    logger.info({ userId: String(user._id) }, "sample line written");
    return text;
  } catch (err) {
    // Never fatal. A paywall without a sample is the paywall we had yesterday.
    logger.warn({ err, userId: String(user._id) }, "sample line failed");
    return null;
  }
}

/** Something to show when generation is unavailable, so the card is never empty. */
export function fallbackSample(locale) {
  const bank = curatedFor(resolveLocale(locale));
  return bank.length > 0 ? bank[0].text : null;
}
