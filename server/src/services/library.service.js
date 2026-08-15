import { Affirmation } from "../models/Affirmation.js";
import { Favorite } from "../models/Favorite.js";
import { Saved } from "../models/Saved.js";
import { User } from "../models/User.js";
import { logger } from "../lib/logger.js";
import { resolveLocale } from "../config/locales.js";
import { isEntitled } from "./subscription.service.js";
import { completeness } from "../services/profile.service.js";
import { generateForLibrary } from "./libraryGeneration.js";
import {
  BATCH_SIZE,
  PAGE_SIZE,
  PROFILE_DRIFT_PERCENT,
  REFILL_BELOW,
  STALE_AFTER_DAYS,
} from "../config/library.js";

/**
 * The scrollable library.
 *
 * One ordered batch per reader, a cursor for where they are in it, and a refill
 * when they get near the end. The daily feed is untouched by all of this — see
 * config/library.js for why the two are deliberately separate things.
 */

// Same shape as the daily replenish: a cheap in-process guard, with the
// database claim below as the actual authority.
const inFlight = new Map();
const CLAIM_MS = 5 * 60 * 1000;

/**
 * What a line looks like to the app.
 *
 * Shaped by hand because the reads below use `.lean()`, which returns raw
 * documents and skips the model's `toJSON` — so `id` never gets derived and
 * `user`, `textKey` and `__v` all travel out to the client. Fast queries are
 * worth keeping; leaking the owner's id with them is not.
 */
const publicLine = (a) => ({
  id: String(a._id),
  text: a.text,
  categorySlug: a.categorySlug,
  locale: a.locale,
  source: a.source,
});

/** The reader's current batch, oldest first — the order they were written in. */
function batchQuery(user) {
  const locale = resolveLocale(user.locale);

  // A free reader's feed is the curated bank: the same human-written rows the
  // daily line falls back to, shared by everyone, written once and costing
  // nothing per head. Premium reads the batch generated for them alone.
  //
  // Same collection, same shape, same real ids — so favouriting, saving and
  // sharing work identically on both and nothing downstream has to care which
  // kind of feed it is looking at.
  if (!isEntitled(user)) return { user: null, source: "curated", locale };

  return { user: user._id, source: "generated", locale, library: true };
}

/**
 * A page of lines they have not reached yet.
 *
 * Reads only. If the batch is running low this schedules a refill and hands
 * back what exists — nobody waits 44 seconds for a scroll to load.
 */
export async function getLibrary(user, { cursor, limit = PAGE_SIZE } = {}) {
  const at = Number.isInteger(cursor) ? cursor : (user.library?.cursor ?? 0);

  const [lines, total] = await Promise.all([
    Affirmation.find(batchQuery(user)).sort({ _id: 1 }).skip(at).limit(limit).lean(),
    Affirmation.countDocuments(batchQuery(user)),
  ]);

  const remaining = Math.max(0, total - at);
  if (needsRefill(user, remaining)) scheduleRefill(user);

  return {
    affirmations: lines.map(publicLine),
    cursor: at,
    total,
    remaining,
    // The app shows a quiet "writing more" state rather than an empty screen.
    refilling: remaining <= 0,
  };
}

/**
 * Move the reader's position.
 *
 * Monotonic: a scroll back up must not un-read what they have already been
 * shown, or the next batch would repeat lines they have seen.
 */
export async function advanceCursor(user, position) {
  const next = Math.max(user.library?.cursor ?? 0, Math.max(0, position));

  await User.updateOne({ _id: user._id }, { $set: { "library.cursor": next } });
  user.library.cursor = next;

  const total = await Affirmation.countDocuments(batchQuery(user));
  if (needsRefill(user, total - next)) scheduleRefill(user);

  return { cursor: next, remaining: Math.max(0, total - next) };
}

/**
 * Three reasons to write a new batch, and they are all about the lines being
 * *wrong* rather than about a schedule: they ran out, they were written for a
 * person we knew less about, or they are simply old.
 */
function needsRefill(user, remaining) {
  // The curated bank is fixed and shared; there is nothing to write more of,
  // and writing it would mean generating for someone who has not paid.
  if (!isEntitled(user)) return false;

  if (remaining <= REFILL_BELOW) return true;

  const batchAt = user.library?.batchAt;
  if (!batchAt) return true;

  const ageDays = (Date.now() - new Date(batchAt).getTime()) / 86_400_000;
  if (ageDays >= STALE_AFTER_DAYS) return true;

  const drift = completeness(user).percent - (user.library?.batchProfilePercent ?? 0);
  return drift >= PROFILE_DRIFT_PERCENT;
}

/** Fire-and-forget. Never awaited by a request; returns the promise for tests. */
export function scheduleRefill(user, options) {
  // Same rule as scheduleReplenish, for the same reason: this is where the
  // model gets paid, so this is where the decision belongs. `warm` calls it
  // directly from a route, so relying on needsRefill alone would leave a door
  // open straight to the bill.
  if (!isEntitled(user)) return Promise.resolve(null);

  const key = String(user._id ?? user.id);
  const running = inFlight.get(key);
  if (running) return running;

  const task = refill(user, options)
    .catch((err) => {
      // A failed refill costs new lines, never the ones they already have.
      logger.error({ err, userId: key }, "library refill failed");
      return { written: 0 };
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

/** Awaits in-flight refills. Tests need this; nothing else should. */
export function flushRefills() {
  return Promise.all([...inFlight.values()]);
}

/**
 * Write a fresh batch and retire the old one.
 *
 * What survives is what they kept — hearted or bookmarked. Everything else in
 * the previous batch is deleted, which is what stops one collection growing
 * forever at 240 lines per reader per refill. A line nobody reacted to and has
 * already scrolled past has no second use.
 */
export async function refill(user, { size = BATCH_SIZE, now = new Date() } = {}) {
  if (!(await claim(user, now))) return { written: 0, claimed: false };

  try {
    const written = await generateForLibrary(user, size);
    if (written.length === 0) return { written: 0 };

    await retirePreviousBatch(user, written);

    const percent = completeness(user).percent;
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "library.cursor": 0,
          "library.batchAt": now,
          "library.batchProfilePercent": percent,
        },
      },
    );

    user.library = { ...user.library, cursor: 0, batchAt: now, batchProfilePercent: percent };

    logger.info({ userId: user.id, written: written.length }, "library refilled");
    return { written: written.length };
  } finally {
    await release(user);
  }
}

/**
 * Drop the lines from the last batch that nobody kept.
 *
 * Hearted and bookmarked rows stay — they are referenced from Favorite and
 * Saved, and deleting them would empty someone's collection without asking.
 * They simply stop being part of the scroll.
 */
async function retirePreviousBatch(user, fresh) {
  const keepIds = [
    ...(await Favorite.find({ user: user._id }, { affirmation: 1 }).lean()),
    ...(await Saved.find({ user: user._id }, { affirmation: 1 }).lean()),
  ].map((r) => String(r.affirmation));

  const freshIds = new Set(fresh.map((a) => String(a._id)));

  const stale = await Affirmation.find(
    { ...batchQuery(user), _id: { $nin: fresh.map((a) => a._id) } },
    { _id: 1 },
  ).lean();

  const removable = stale
    .map((a) => a._id)
    .filter((id) => !keepIds.includes(String(id)) && !freshIds.has(String(id)));

  if (removable.length > 0) {
    await Affirmation.deleteMany({ _id: { $in: removable } });
  }

  // Kept lines leave the scroll but stay in the collection they were kept into.
  await Affirmation.updateMany(
    { ...batchQuery(user), _id: { $in: keepIds } },
    { $set: { library: false } },
  );

  return { retired: removable.length };
}

async function claim(user, now) {
  const won = await User.findOneAndUpdate(
    {
      _id: user._id,
      $or: [{ "library.generatingUntil": null }, { "library.generatingUntil": { $lte: now } }],
    },
    { $set: { "library.generatingUntil": new Date(now.getTime() + CLAIM_MS) } },
    { projection: { _id: 1 } },
  ).lean();

  return Boolean(won);
}

function release(user) {
  return User.updateOne({ _id: user._id }, { $set: { "library.generatingUntil": null } });
}
