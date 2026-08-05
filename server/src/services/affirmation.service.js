import { Affirmation } from "../models/Affirmation.js";
import { FeedEntry } from "../models/FeedEntry.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { todayInZone, dateRange } from "../utils/dates.js";
import {
  generateAffirmations,
  AiUnavailableError,
} from "./vertex.service.js";
import { filterAffirmations, focusNeedsCare } from "./moderation.service.js";
import { profileNeedsCare, FREE_TEXT_FIELDS } from "../config/profileFields.js";
import { LANGUAGE_NAMES, resolveLocale } from "../config/locales.js";
import { PROMPT_VERSION } from "../prompts/affirmation.prompt.js";

/**
 * Schedules the user's feed far enough into the future that the phone always has
 * something to cache. Generation happens here, ahead of time — never on the read
 * path — which is what keeps the Today screen instant and lets the app work
 * offline.
 *
 * Safe to call on every read: it only does work when days are actually missing.
 */
export async function ensureFeed(user, { days = env.FEED_BUFFER_DAYS } = {}) {
  const today = todayInZone(user.timezone);
  const wanted = dateRange(today, days);

  const existing = await FeedEntry.find(
    { user: user._id, date: { $in: wanted } },
    { date: 1 },
  ).lean();

  const have = new Set(existing.map((e) => e.date));
  const missing = wanted.filter((d) => !have.has(d));

  if (missing.length === 0) return { scheduled: 0 };

  const affirmations = await takeAffirmations(user, missing.length);

  if (affirmations.length === 0) {
    logger.error({ userId: user.id }, "no affirmations available to schedule");
    return { scheduled: 0 };
  }

  const rows = missing.slice(0, affirmations.length).map((date, i) => ({
    insertOne: {
      document: { user: user._id, date, affirmation: affirmations[i]._id },
    },
  }));

  // Unordered so a concurrent request that already scheduled one of these dates
  // costs us that row, not the whole batch. The unique index is the arbiter.
  const result = await FeedEntry.bulkWrite(rows, { ordered: false }).catch(
    (err) => {
      if (err?.code === 11000 || err?.writeErrors) return err.result;
      throw err;
    },
  );

  const scheduled = result?.insertedCount ?? 0;
  logger.info({ userId: user.id, scheduled }, "scheduled feed days");
  return { scheduled };
}

/**
 * Produces `count` affirmations the user has not been scheduled before,
 * preferring their own generated pool, then generating more, then falling back
 * to the curated bank.
 */
async function takeAffirmations(user, count) {
  const usedIds = await FeedEntry.distinct("affirmation", { user: user._id });
  const locale = resolveLocale(user.locale);

  // Anything generated before the reader switched language is still in their
  // pool but is now the wrong language, so the locale filter applies here too.
  const pool = await Affirmation.find({
    user: user._id,
    locale,
    _id: { $nin: usedIds },
  }).limit(count);

  if (pool.length >= count) return pool;

  const shortfall = count - pool.length;
  const generated = await tryGenerate(user, shortfall);
  const combined = [...pool, ...generated];

  if (combined.length >= count) return combined.slice(0, count);

  const curated = await drawCurated(user, count - combined.length, [
    ...usedIds,
    ...combined.map((a) => a._id),
  ], locale);

  return [...combined, ...curated];
}

/**
 * Generation is best-effort by design. A Vertex outage, a blocked response, or a
 * batch that fails moderation must never surface to the user — the curated bank
 * covers it and the next run tries again.
 */
async function tryGenerate(user, count) {
  if (!env.AI_ENABLED || count <= 0) return [];

  const prefs = user.preferences ?? {};
  // Falls back to English for any locale we can't moderate, so we never generate
  // in a language whose safety rules don't exist.
  const locale = resolveLocale(user.locale);

  // If someone's stated focus touches crisis or clinical ground, we do not send
  // it to the model or generate against it. They get the curated bank's gentle,
  // general lines instead, and we never echo the topic back at them.
  const focus = focusNeedsCare(prefs.focus, locale) ? "" : prefs.focus;
  if (focus !== prefs.focus) {
    logger.info({ userId: user.id }, "focus routed to curated bank");
    return [];
  }

  const recent = await Affirmation.find({ user: user._id }, { text: 1 })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  // A crisis-adjacent structured answer (low mood, breakup, therapy…) still
  // generates, but gently — see prompts/affirmation.prompt.js.
  //
  // Free text gets the same treatment per field: anything `focusNeedsCare`
  // rejects is dropped from the prompt entirely (never paraphrased back), and
  // its presence also softens the whole batch.
  const freeTextNeedsCare = FREE_TEXT_FIELDS.some((f) =>
    focusNeedsCare(user.profile?.[f.key], locale),
  );
  const gentle = profileNeedsCare(user.profile) || freeTextNeedsCare;

  try {
    // Over-request: moderation will reject some, and a short batch means a
    // second round trip.
    const raw = await generateAffirmations({
      count: Math.ceil(count * 1.4) + 2,
      categories: prefs.categories ?? [],
      tone: prefs.tone,
      displayName: prefs.useFirstName ? user.firstName : null,
      focus,
      avoid: recent.map((r) => r.text),
      profile: user.profile ?? {},
      gentle,
      // The authority on which of their own words may reach the model.
      // Screened in the reader's own language — English patterns say nothing
      // about Spanish text, so omitting the locale here would wave it through.
      screenText: (text) => !focusNeedsCare(text, locale),
      language: LANGUAGE_NAMES[locale],
    });

    // Checked in the language it was written in — English patterns say nothing
    // about other languages.
    const { approved, rejected } = filterAffirmations(raw, locale);

    if (rejected.length > 0) {
      logger.warn(
        { userId: user.id, rejected: rejected.length, reasons: rejected.map((r) => r.reason) },
        "affirmations rejected by moderation",
      );
    }

    if (approved.length === 0) return [];

    const validCategories = prefs.categories?.length ? prefs.categories : null;

    const docs = approved.map((a) => ({
      text: a.text,
      textKey: a.text.toLowerCase(),
      categorySlug:
        validCategories && validCategories.includes(a.category)
          ? a.category
          : (a.category ?? "general"),
      source: "generated",
      user: user._id,
      locale,
      promptVersion: PROMPT_VERSION,
    }));

    // Unordered: a duplicate the model happened to repeat shouldn't lose the batch.
    const inserted = await Affirmation.insertMany(docs, {
      ordered: false,
      rawResult: false,
    }).catch((err) => {
      if (err?.code === 11000 || err?.writeErrors) return err.insertedDocs ?? [];
      throw err;
    });

    return inserted;
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      logger.warn(
        { userId: user.id, err: err.message, cause: err.cause?.message },
        "generation unavailable — falling back to curated bank",
      );
      return [];
    }
    throw err;
  }
}

/**
 * Draws from the curated bank, exhausting the user's preferred categories before
 * widening.
 *
 * The tiers accumulate rather than replace each other: if someone picks "calm"
 * and the bank holds five calm lines but fourteen days need filling, they get
 * all five plus nine from elsewhere — not fourteen arbitrary ones.
 */
async function drawCurated(user, count, excludeIds, locale = resolveLocale(user.locale)) {
  if (count <= 0) return [];

  const categories = user.preferences?.categories ?? [];
  const base = { source: "curated", user: null, locale };
  const picked = [];

  const tiers = [
    ...(categories.length
      ? [{ ...base, categorySlug: { $in: categories } }]
      : []),
    base,
  ];

  for (const match of tiers) {
    const need = count - picked.length;
    if (need <= 0) break;

    const docs = await Affirmation.aggregate([
      {
        $match: {
          ...match,
          _id: { $nin: [...excludeIds, ...picked.map((p) => p._id)] },
        },
      },
      { $sample: { size: need } },
    ]);

    picked.push(...docs);
  }

  // Bank exhausted. A repeat is better than a day with nothing on it.
  if (picked.length < count) {
    const filler = await Affirmation.aggregate([
      { $match: base },
      { $sample: { size: count - picked.length } },
    ]);
    picked.push(...filler);
  }

  return picked.slice(0, count);
}

export async function getFeed(user, { days }) {
  const limit = Math.min(days, env.FEED_MAX_SYNC_DAYS);
  await ensureFeed(user, { days: Math.max(limit, env.FEED_BUFFER_DAYS) });

  const today = todayInZone(user.timezone);
  const window = dateRange(today, limit);

  return FeedEntry.find({ user: user._id, date: { $in: window } })
    .sort({ date: 1 })
    .populate("affirmation");
}

/**
 * Days already behind the reader, newest first.
 *
 * Only days that were actually seen: an unseen past day is one the app was
 * never opened on, and putting it in a stream someone is scrolling back through
 * would be showing them a memory they never had.
 *
 * Deliberately backwards-only. The scheduled buffer runs weeks ahead, and
 * letting anyone scroll into it would turn a daily line into a list — which is
 * the one thing the whole product is arranged to avoid.
 */
export async function getHistory(user, { days = 30, before } = {}) {
  const today = todayInZone(user.timezone);
  const cursor = before && before < today ? before : today;

  return FeedEntry.find({
    user: user._id,
    date: { $lt: cursor },
    seenAt: { $ne: null },
  })
    .sort({ date: -1 })
    .limit(Math.min(days, env.FEED_MAX_SYNC_DAYS))
    .populate("affirmation");
}

export async function getToday(user) {
  await ensureFeed(user);
  const today = todayInZone(user.timezone);
  return FeedEntry.findOne({ user: user._id, date: today }).populate(
    "affirmation",
  );
}

/**
 * Called when preferences change: drops future scheduling and the unused
 * generated pool so the next read regenerates against the new profile. Days
 * already seen are left alone — rewriting someone's history is disorienting.
 */
export async function resetFutureFeed(user) {
  const today = todayInZone(user.timezone);

  const future = await FeedEntry.find(
    { user: user._id, date: { $gt: today }, seenAt: null },
    { affirmation: 1 },
  ).lean();

  await FeedEntry.deleteMany({
    user: user._id,
    date: { $gt: today },
    seenAt: null,
  });

  await Affirmation.deleteMany({
    user: user._id,
    source: "generated",
    _id: { $in: future.map((f) => f.affirmation) },
  });
}
