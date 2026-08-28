import { Affirmation } from "../models/Affirmation.js";
import { FeedEntry } from "../models/FeedEntry.js";
import { AppError } from "../utils/AppError.js";
import { isEntitled } from "../services/subscription.service.js";
import { focusNeedsCare } from "../services/moderation.service.js";
import { resolveLocale } from "../config/locales.js";
import { resetFutureFeed, ensureFeed } from "../services/affirmation.service.js";

export const MAX_CUSTOM = 100;

/**
 * The reader's own affirmations.
 *
 * These are NOT put through the style rules that generated text faces. Those
 * rules exist to hold a model to our voice; applying them to someone's own
 * words would be correcting a person's private sentence to themselves, which is
 * both rude and beside the point.
 *
 * One check does apply: crisis and clinical language. Something written in a
 * bad hour should not be scheduled to resurface every morning, and a reminder
 * notification carries the text to the lock screen. Refusing that is care, not
 * censorship — and the refusal says so.
 */
function requirePremium(user) {
  if (!isEntitled(user)) {
    throw AppError.forbidden("Writing your own affirmations is part of Saydle premium.");
  }
}

export async function listCustom(req, res, next) {
  try {
    const affirmations = await Affirmation.find({
      user: req.user._id,
      source: "custom",
    }).sort({ createdAt: -1 });

    res.json({ affirmations: affirmations.map((a) => a.toJSON()) });
  } catch (err) {
    next(err);
  }
}

export async function createCustom(req, res, next) {
  try {
    requirePremium(req.user);

    const text = req.body.text.trim();
    const locale = resolveLocale(req.user.locale);

    if (focusNeedsCare(text, locale)) {
      throw AppError.badRequest(
        "Let's not set this one as a daily reminder. If things are hard right now, please talk to someone you trust.",
        { text: "This one is better shared with a person than a phone." },
      );
    }

    const count = await Affirmation.countDocuments({
      user: req.user._id,
      source: "custom",
    });

    if (count >= MAX_CUSTOM) {
      throw AppError.badRequest(`You can keep up to ${MAX_CUSTOM} of your own affirmations.`);
    }

    const affirmation = await Affirmation.create({
      text,
      textKey: text.toLowerCase(),
      categorySlug: req.body.categorySlug ?? "general",
      source: "custom",
      user: req.user._id,
      locale,
    }).catch((err) => {
      // The unique index on (user, textKey) is the real guard against duplicates.
      if (err?.code === 11000) {
        throw AppError.conflict("You've already written that one.");
      }
      throw err;
    });

    // Rebuild the days ahead so their own words start appearing tomorrow rather
    // than after the existing buffer runs out weeks from now.
    await resetFutureFeed(req.user);
    await ensureFeed(req.user);

    req.log?.info({ userId: req.user.id }, "custom affirmation written");
    res.status(201).json({ affirmation: affirmation.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function deleteCustom(req, res, next) {
  try {
    const affirmation = await Affirmation.findOne({
      _id: req.params.id,
      user: req.user._id,
      source: "custom",
    });

    if (!affirmation) throw AppError.notFound("That affirmation doesn't exist.");

    // Days already read keep it: rewriting someone's history is disorienting,
    // and they did read it. Only the unseen future loses it.
    await FeedEntry.deleteMany({
      user: req.user._id,
      affirmation: affirmation._id,
      seenAt: null,
    });
    await affirmation.deleteOne();
    await ensureFeed(req.user);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
