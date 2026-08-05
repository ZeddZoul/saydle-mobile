import { FeedEntry } from "../models/FeedEntry.js";
import { Favorite } from "../models/Favorite.js";
import { Affirmation } from "../models/Affirmation.js";
import { Category } from "../models/Category.js";
import { AppError } from "../utils/AppError.js";
import { isValidTimezone, todayInZone } from "../utils/dates.js";
import {
  getFeed,
  getHistory,
  getToday,
  resetFutureFeed,
  ensureFeed,
} from "../services/affirmation.service.js";

const serializeEntry = (entry) => ({
  date: entry.date,
  seenAt: entry.seenAt,
  affirmation: entry.affirmation?.toJSON?.() ?? entry.affirmation,
});

export async function today(req, res, next) {
  try {
    const entry = await getToday(req.user);

    if (!entry) {
      throw AppError.notFound("No affirmation is scheduled for today yet.");
    }

    res.json({ entry: serializeEntry(entry) });
  } catch (err) {
    next(err);
  }
}

/**
 * The offline sync endpoint: hand the client every scheduled day it can hold, so
 * it can render the Today screen with no network at all.
 */
export async function feed(req, res, next) {
  try {
    const entries = await getFeed(req.user, { days: req.query.days });

    res.json({
      // The client stores this and renders whichever date matches its local
      // clock — the server does not need to be reachable for that to work.
      today: todayInZone(req.user.timezone),
      timezone: req.user.timezone,
      entries: entries.map(serializeEntry),
    });
  } catch (err) {
    next(err);
  }
}

export async function history(req, res, next) {
  try {
    const entries = await getHistory(req.user, {
      days: req.query.days,
      before: req.query.before,
    });

    res.json({
      today: todayInZone(req.user.timezone),
      entries: entries.map(serializeEntry),
    });
  } catch (err) {
    next(err);
  }
}

export async function markSeen(req, res, next) {
  try {
    const entry = await FeedEntry.findOneAndUpdate(
      { user: req.user._id, date: req.params.date, seenAt: null },
      { $set: { seenAt: new Date() } },
      { new: true },
    );

    // Already-seen and never-scheduled both mean "nothing to do". A client
    // flushing a queued write should not get an error for being late.
    res.json({ ok: true, seenAt: entry?.seenAt ?? null });
  } catch (err) {
    next(err);
  }
}

export async function listFavorites(req, res, next) {
  try {
    const favorites = await Favorite.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("affirmation");

    res.json({
      favorites: favorites
        .filter((f) => f.affirmation)
        .map((f) => ({
          favoritedAt: f.createdAt,
          affirmation: f.affirmation.toJSON(),
        })),
    });
  } catch (err) {
    next(err);
  }
}

export async function addFavorite(req, res, next) {
  try {
    const affirmation = await Affirmation.findById(req.params.id);

    if (!affirmation) throw AppError.notFound("Affirmation not found.");

    // A generated affirmation belongs to one person; curated rows are shared.
    if (affirmation.user && !affirmation.user.equals(req.user._id)) {
      throw AppError.notFound("Affirmation not found.");
    }

    // Upsert rather than insert, so a client retrying a queued write is a no-op
    // instead of a 409.
    await Favorite.updateOne(
      { user: req.user._id, affirmation: affirmation._id },
      { $setOnInsert: { user: req.user._id, affirmation: affirmation._id } },
      { upsert: true },
    );

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(req, res, next) {
  try {
    await Favorite.deleteOne({
      user: req.user._id,
      affirmation: req.params.id,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function listCategories(_req, res, next) {
  try {
    const categories = await Category.find({ isActive: true }).sort({
      order: 1,
      name: 1,
    });
    res.json({ categories: categories.map((c) => c.toJSON()) });
  } catch (err) {
    next(err);
  }
}

export async function getPreferences(req, res) {
  res.json({
    preferences: req.user.preferences,
    timezone: req.user.timezone,
    locale: req.user.locale,
  });
}

export async function updatePreferences(req, res, next) {
  try {
    const { timezone, locale, ...prefs } = req.body;

    if (timezone !== undefined) {
      if (!isValidTimezone(timezone)) {
        throw AppError.badRequest("Request validation failed.", {
          timezone: "Not a recognised IANA timezone.",
        });
      }
      req.user.timezone = timezone;
    }

    // Top-level on the user, not a preference: it decides which safety rules and
    // which curated bank apply, so it is closer to identity than to taste.
    if (locale !== undefined) req.user.locale = locale;

    for (const [key, value] of Object.entries(prefs)) {
      req.user.preferences[key] = value;
    }

    await req.user.save();

    // What was scheduled ahead was generated against the old profile, so it is
    // dropped and rebuilt. Days already seen are left alone.
    //
    // Reminders change *when* affirmations appear and the theme changes what
    // they're read against — neither changes what they say, so neither justifies
    // throwing away a generated week.
    const COSMETIC = new Set(["reminders", "theme"]);
    // A language change rewrites every scheduled day — nothing about an English
    // affirmation serves a reader who just switched to Spanish.
    const changedContent =
      locale !== undefined || Object.keys(prefs).some((key) => !COSMETIC.has(key));
    if (changedContent) {
      await resetFutureFeed(req.user);
      await ensureFeed(req.user);
    }

    res.json({
      preferences: req.user.preferences,
      timezone: req.user.timezone,
      locale: req.user.locale,
    });
  } catch (err) {
    next(err);
  }
}
