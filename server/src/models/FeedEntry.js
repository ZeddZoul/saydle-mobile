import mongoose from "mongoose";

/**
 * "User U sees affirmation A on day D."
 *
 * Days are scheduled ahead of time rather than chosen at read time. That is what
 * makes the feed deterministic (the same day always shows the same affirmation,
 * however many times the app is opened) and what makes offline caching trivial —
 * the phone just pulls future rows and reads them locally.
 */
const feedEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // "YYYY-MM-DD" in the user's timezone. See utils/dates.js for why it's a string.
    date: { type: String, required: true },
    affirmation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Affirmation",
      required: true,
    },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One affirmation per user per day, enforced by the database rather than by
// hoping two concurrent requests don't both schedule the same date.
feedEntrySchema.index({ user: 1, date: 1 }, { unique: true });

export const FeedEntry =
  mongoose.models.FeedEntry ?? mongoose.model("FeedEntry", feedEntrySchema);
