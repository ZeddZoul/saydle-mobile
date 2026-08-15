import { Affirmation } from "../models/Affirmation.js";
import { Saved } from "../models/Saved.js";
import { isEntitled } from "../services/subscription.service.js";
import { getLibrary, advanceCursor, scheduleRefill } from "../services/library.service.js";
import { REQUIRES_PREMIUM, PAGE_SIZE } from "../config/library.js";
import { AppError } from "../utils/AppError.js";

/**
 * The one place the library's paywall is decided.
 *
 * Every handler below goes through it, so opening the library — for a
 * promotion, or because the trial is replaced by a hard paywall later — is a
 * single edit in config/library.js rather than an audit of route handlers.
 */
function gate(user) {
  if (!REQUIRES_PREMIUM) return;
  if (isEntitled(user)) return;

  throw AppError.forbidden("The affirmation library is part of Saydle premium.");
}

export async function list(req, res, next) {
  try {
    gate(req.user);

    const cursor = req.query.cursor === undefined ? undefined : Number(req.query.cursor);
    const limit = Math.min(Number(req.query.limit) || PAGE_SIZE, PAGE_SIZE);

    res.json(await getLibrary(req.user, { cursor, limit }));
  } catch (err) {
    next(err);
  }
}

/**
 * Record how far they have scrolled.
 *
 * The whole seen-state is this one number. Sent as the reader scrolls rather
 * than per line, because the app is not asking permission — it is telling us
 * where it got to.
 */
export async function seen(req, res, next) {
  try {
    gate(req.user);
    res.json(await advanceCursor(req.user, Number(req.body.cursor)));
  } catch (err) {
    next(err);
  }
}

export async function listSaved(req, res, next) {
  try {
    gate(req.user);

    const rows = await Saved.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("affirmation");

    res.json({ saved: rows.filter((r) => r.affirmation) });
  } catch (err) {
    next(err);
  }
}

/**
 * Bookmark a line. Distinct from a favourite on purpose — a heart is a
 * reaction, a bookmark is an intention to come back.
 */
export async function save(req, res, next) {
  try {
    gate(req.user);

    const affirmation = await Affirmation.findOne({
      _id: req.params.id,
      $or: [{ user: req.user._id }, { user: null }],
    });

    if (!affirmation) throw AppError.notFound("That affirmation does not exist.");

    // Idempotent: bookmarking twice is the same bookmark, not an error to show.
    await Saved.updateOne(
      { user: req.user._id, affirmation: affirmation._id },
      { $setOnInsert: { user: req.user._id, affirmation: affirmation._id } },
      { upsert: true },
    );

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function unsave(req, res, next) {
  try {
    gate(req.user);
    await Saved.deleteOne({ user: req.user._id, affirmation: req.params.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/** Used by the onboarding screen that covers the first batch's latency. */
export async function warm(req, res, next) {
  try {
    gate(req.user);
    scheduleRefill(req.user);
    res.status(202).json({ started: true });
  } catch (err) {
    next(err);
  }
}
