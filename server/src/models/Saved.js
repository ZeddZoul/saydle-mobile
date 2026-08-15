import mongoose from "mongoose";

/**
 * A line someone bookmarked to come back to.
 *
 * Deliberately not the same thing as a favourite. A heart is a reaction — "this
 * one landed" — and it happens in the moment. A bookmark is an intention: keep
 * this somewhere I can find it again. People use both, on different lines, for
 * different reasons, and collapsing them into one control loses which of the two
 * they meant.
 *
 * Same shape as Favorite on purpose, so the two read as siblings rather than as
 * one having been bolted on afterwards.
 */
const savedSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    affirmation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Affirmation",
      required: true,
    },
  },
  { timestamps: true },
);

// Bookmarking twice is the same bookmark, not two.
savedSchema.index({ user: 1, affirmation: 1 }, { unique: true });

export const Saved = mongoose.models.Saved ?? mongoose.model("Saved", savedSchema);
