import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
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

// Makes favouriting idempotent at the database level, which is what lets the
// mobile client retry a queued write without checking first.
favoriteSchema.index({ user: 1, affirmation: 1 }, { unique: true });

export const Favorite = mongoose.models.Favorite ?? mongoose.model("Favorite", favoriteSchema);
