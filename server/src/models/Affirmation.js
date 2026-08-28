import mongoose from "mongoose";
import { DEFAULT_LOCALE } from "../config/locales.js";

/**
 * One affirmation, either hand-written (`curated`) or model-generated.
 *
 * Curated rows have `user: null` and form the shared fallback bank — what every
 * user sees before their first generation lands, and what covers a Vertex
 * outage or a batch that moderation rejected wholesale.
 */
const affirmationSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 100 },
    // Lowercased copy of `text`, used only by the uniqueness index below.
    textKey: { type: String, required: true },
    categorySlug: { type: String, required: true, index: true },
    // The language the text is written in. The curated draw filters on it, so a
    // Spanish reader never gets an English fallback line.
    locale: { type: String, default: DEFAULT_LOCALE, index: true },
    source: {
      type: String,
      // "custom" is the reader's own writing — never generated, never moderated
      // for style, and always theirs to delete.
      enum: ["curated", "generated", "custom"],
      required: true,
      index: true,
    },
    // null for curated rows; set for anything generated for a specific person.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Which version of SYSTEM_PROMPT produced this, so a prompt change can be
    // traced to the content it created.
    promptVersion: { type: Number, default: null },

    /**
     * Part of the reader's current scrollable batch.
     *
     * Set false rather than deleted when a line is retired: one they hearted or
     * bookmarked has to survive leaving the scroll, or refilling would quietly
     * empty their collection. The daily feed never sets this.
     */
    library: { type: Boolean, default: false, index: true },

    /**
     * 1-7 on the seven the model marked for a listening session; null on the
     * rest. Sparse-indexed because seven rows in a batch of 240 carry it.
     *
     * Stored rather than recomputed: it is a judgement the model made with this
     * reader's profile in front of it, and nothing later has that context.
     */
    practiceRank: { type: Number, default: null, index: { sparse: true } },
  },
  { timestamps: true },
);

// Stops the same line being stored twice for one user (and twice in the curated
// bank). Mongo treats each distinct `user` value, including null, as its own key.
affirmationSchema.index({ user: 1, textKey: 1 }, { unique: true });

affirmationSchema.pre("validate", function setTextKey(next) {
  if (this.text) this.textKey = this.text.trim().toLowerCase();
  next();
});

affirmationSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.textKey;
    delete ret.user;
    return ret;
  },
});

export const Affirmation =
  mongoose.models.Affirmation ?? mongoose.model("Affirmation", affirmationSchema);
