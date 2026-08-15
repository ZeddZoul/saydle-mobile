import { Affirmation } from "../models/Affirmation.js";
import { FeedEntry } from "../models/FeedEntry.js";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { todayInZone, dateRange } from "../utils/dates.js";
import { generateAffirmations, AiUnavailableError } from "./vertex.service.js";
import { filterAffirmations, focusNeedsCare } from "./moderation.service.js";
import { profileNeedsCare, FREE_TEXT_FIELDS } from "../config/profileFields.js";
import { LANGUAGE_NAMES, resolveLocale } from "../config/locales.js";
import { PROMPT_VERSION } from "../prompts/affirmation.prompt.js";
import { PAUSE_GENERATION_WHEN_PENDING } from "../config/deletion.js";
import { isEntitled } from "./subscription.service.js";
import { isPending } from "./deletion.service.js";

/**
 * Schedules the user's feed far enough into the future that the phone always has
 * something to cache.
 *
 * **This never waits for the model.** Days are filled from the reader's own
 * already-generated pool, and from the curated bank when that pool is short —
 * both plain database reads, both measured in milliseconds. Anything the model
 * needs to produce is handed to `replenish` and happens after the response.
 *
 * That split is the whole point. When this function generated inline, a brand
 * new account's first request had nothing to draw on, so it sat waiting on a
 * 30-day batch: measured at 20.2s against a client that gives up at 15s. The
 * work completed and the reader was told "Could not reach Saydle" — the worst
 * possible first screen, on the one request where the product is being judged.
 *
 * Safe to call on every read: it only does work when days are actually missing.
 */
export async function ensureFeed(user, options) {
  const result = await fillFeed(user, options);

  // Deliberately not awaited: topping the pool up is what makes *tomorrow*
  // personal, and no reader should wait on it to be handed today.
  scheduleReplenish(user);

  return result;
}

async function fillFeed(user, { days = env.FEED_BUFFER_DAYS } = {}) {
  const today = todayInZone(user.timezone);
  const wanted = dateRange(today, days);

  const existing = await FeedEntry.find(
    { user: user._id, date: { $in: wanted } },
    { date: 1 },
  ).lean();

  const have = new Set(existing.map((e) => e.date));
  const missing = wanted.filter((d) => !have.has(d));

  if (missing.length === 0) return { scheduled: 0 };

  const affirmations = await takeAffirmations(user, missing.length, { generate: false });

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
  const result = await FeedEntry.bulkWrite(rows, { ordered: false }).catch((err) => {
    if (err?.code === 11000 || err?.writeErrors) return err.result;
    throw err;
  });

  const scheduled = result?.insertedCount ?? 0;
  logger.info({ userId: user.id, scheduled }, "scheduled feed days");
  return { scheduled };
}

/**
 * Produces `count` affirmations the user has not been scheduled before,
 * preferring their own generated pool, then generating more, then falling back
 * to the curated bank.
 *
 * `generate` is false on the read path and true only in the background: the
 * curated bank is what a reader gets instead of a spinner, never instead of
 * personalisation — `replenish` upgrades the days behind them.
 */
async function takeAffirmations(user, count, { generate = true } = {}) {
  const usedIds = await FeedEntry.distinct("affirmation", { user: user._id });
  const locale = resolveLocale(user.locale);

  // Anything generated before the reader switched language is still in their
  // pool but is now the wrong language, so the locale filter applies here too.
  const fetched = await Affirmation.find({
    user: user._id,
    locale,
    // Never the scrollable library. A line can be today's or it can be in the
    // scroll, not both — and more importantly, retiring a library batch deletes
    // what nobody kept, which would rewrite a day the reader has already lived.
    library: { $ne: true },
    _id: { $nin: usedIds },
    // Headroom over `count`: the crisis screen below may drop custom rows, and
    // a short fetch here would under-fill days that generated lines could cover.
  }).limit(count + 20);

  /**
   * "My words" joins the days ahead — that is the feature — but only through
   * the same crisis screen the model's own input gets. The private list is
   * deliberately unmoderated, because people write hard things for real
   * reasons; the daily slot is anything but private — it feeds the widget, the
   * share card and notifications, all under our wordmark. Found the hard way:
   * a test entry reading "I can kill as much as I want" was scheduled as today
   * and rendered on the home-screen widget. The line stays theirs in "My
   * words"; it just never becomes the line Saydle appears to say.
   */
  const pool = fetched
    .filter((a) => a.source !== "custom" || !focusNeedsCare(a.text, locale))
    .slice(0, count);

  if (pool.length >= count) return pool;

  const shortfall = count - pool.length;
  const generated = generate ? await tryGenerate(user, shortfall) : [];
  const combined = [...pool, ...generated];

  if (combined.length >= count) return combined.slice(0, count);

  const curated = await drawCurated(
    user,
    count - combined.length,
    [...usedIds, ...combined.map((a) => a._id)],
    locale,
  );

  return [...combined, ...curated];
}

// Replenishment already running, per user. Two requests landing together —
// Today and the feed sync, which the app fires within a second of each other —
// would otherwise each start their own 20-second batch for the same account.
const inFlight = new Map();

// How long a claim on a reader's generation is honoured across instances. Long
// enough to cover a slow batch (measured worst case ~20s) with room to spare,
// short enough that a process killed mid-batch frees the reader within minutes
// rather than never. See `claim`.
const CLAIM_MS = 2 * 60 * 1000;

/**
 * Start a replenishment for this user unless one is already running.
 *
 * Returns the in-flight promise so callers *may* await it (registration and the
 * tests do); the read path deliberately does not. Failures are logged and
 * swallowed here rather than left to reject, because nobody is holding this
 * promise on the request path and an unhandled rejection would take the process
 * down over a model outage.
 */
export function scheduleReplenish(user, options) {
  if (!env.AI_ENABLED) return Promise.resolve(null);

  // An account counting down to deletion stops costing us model time. The
  // curated bank keeps their days filled, so nothing visibly degrades, and
  // cancelling puts them straight back in the queue on the next read.
  if (PAUSE_GENERATION_WHEN_PENDING && isPending(user)) return Promise.resolve(null);

  // Generation *is* the product premium sells. A free reader gets the curated
  // bank, which is written once and costs nothing per head, so there is nothing
  // to generate for them and no reason to pay a model to do it.
  //
  // The guard lives here rather than at each call site on purpose: every path
  // that could bill us — registration, the read path, a future cron — goes
  // through this function, and one of them forgetting is a bill nobody notices
  // until it arrives.
  if (!isEntitled(user)) return Promise.resolve(null);

  const key = String(user._id ?? user.id);
  const running = inFlight.get(key);
  if (running) return running;

  const task = replenish(user, options)
    .catch((err) => {
      logger.warn({ err, userId: key }, "replenish failed");
      return null;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

/**
 * Await whatever replenishment is currently in flight.
 *
 * Tests need it because the read path deliberately does not wait: asserting on
 * the generator straight after a request would otherwise be asserting against
 * work that has not started, which passes for the wrong reason. A graceful
 * shutdown wants the same guarantee.
 */
export function flushReplenish() {
  return Promise.all([...inFlight.values()]);
}

/**
 * Top the reader's generated pool back up, then hand the fresh lines to days
 * that are currently holding curated ones.
 *
 * The upgrade pass is what keeps the fast read path honest: a new account gets
 * bank lines instantly, and by the time they next open the app the days ahead
 * of them are their own. Today is deliberately left alone — swapping the line
 * someone is in the middle of reading is worse than a day of the bank.
 */
export async function replenish(user, { days = env.FEED_BUFFER_DAYS } = {}) {
  if (!env.AI_ENABLED) return { generated: 0, upgraded: 0 };

  const locale = resolveLocale(user.locale);
  const scheduled = await FeedEntry.distinct("affirmation", { user: user._id });

  const spare = await Affirmation.countDocuments({
    user: user._id,
    locale,
    source: "generated",
    _id: { $nin: scheduled },
  });

  const wanted = days - spare;
  if (wanted <= 0) return { generated: 0, upgraded: 0 };

  // Asked only once the count above says there is work to do, so the common
  // read — pool already full — costs a count and no write at all.
  if (!(await claim(user))) return { generated: 0, upgraded: 0 };

  try {
    const generated = await tryGenerate(user, wanted);
    const upgraded = generated.length > 0 ? await upgradeScheduled(user, locale) : 0;

    logger.info({ userId: user.id, generated: generated.length, upgraded }, "replenished pool");
    return { generated: generated.length, upgraded };
  } finally {
    await release(user);
  }
}

/**
 * Win — or lose — the right to generate for this reader.
 *
 * `inFlight` above dedupes within one process, which is all a single server
 * needs. It is also the wrong place for the guarantee: two instances behind a
 * load balancer cannot see each other's memory, so each would happily bill us
 * for the same reader's batch. This claim lives in the database, where every
 * instance can see it.
 *
 * One conditional update, applied atomically by Mongo: whoever matches first
 * writes the deadline, and every other instance's filter stops matching. The
 * `$lte` arm is what makes it a deadline rather than a flag — a process killed
 * mid-batch would otherwise lock that reader out of generation permanently,
 * which is a far worse failure than paying for one duplicate batch.
 */
async function claim(user) {
  const now = new Date();

  const won = await User.findOneAndUpdate(
    {
      _id: user._id,
      $or: [{ replenishingUntil: null }, { replenishingUntil: { $lte: now } }],
    },
    { $set: { replenishingUntil: new Date(now.getTime() + CLAIM_MS) } },
    { projection: { _id: 1 } },
  ).lean();

  return Boolean(won);
}

/** Released in a `finally`: a claim held past a crash is what the deadline covers. */
function release(user) {
  return User.updateOne({ _id: user._id }, { $set: { replenishingUntil: null } });
}

/**
 * Re-point future, unseen days that are holding curated lines at freshly
 * generated ones. Days already seen are history and are never rewritten.
 */
async function upgradeScheduled(user, locale) {
  const today = todayInZone(user.timezone);
  const scheduled = await FeedEntry.distinct("affirmation", { user: user._id });

  const fresh = await Affirmation.find({
    user: user._id,
    locale,
    source: "generated",
    _id: { $nin: scheduled },
  });

  if (fresh.length === 0) return 0;

  const future = await FeedEntry.find({
    user: user._id,
    date: { $gt: today },
    seenAt: null,
  })
    .sort({ date: 1 })
    .populate("affirmation");

  const stale = future.filter((entry) => entry.affirmation?.source === "curated");
  if (stale.length === 0) return 0;

  const swaps = stale.slice(0, fresh.length).map((entry, i) => ({
    updateOne: {
      filter: { _id: entry._id, seenAt: null },
      update: { $set: { affirmation: fresh[i]._id } },
    },
  }));

  const result = await FeedEntry.bulkWrite(swaps, { ordered: false });
  return result?.modifiedCount ?? 0;
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
    ...(categories.length ? [{ ...base, categorySlug: { $in: categories } }] : []),
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
  return FeedEntry.findOne({ user: user._id, date: today }).populate("affirmation");
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
