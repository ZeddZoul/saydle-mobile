import mongoose from "mongoose";

/**
 * A pending password-reset code.
 *
 * Only the SHA-256 of the code is stored, for the same reason as refresh tokens:
 * a database dump must not hand anyone a way in.
 *
 * A six-digit code is only a million possibilities, so the code alone is not the
 * security boundary — `attempts` is. Five wrong guesses burns the code, and the
 * short TTL closes the window.
 */
const passwordResetTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    codeHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Mongo sweeps expired codes on its own. Lazy (~60s), so never rely on it for an
// auth decision — `isUsable()` is the authority.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

passwordResetTokenSchema.methods.isUsable = function isUsable() {
  return this.usedAt === null && this.attempts < 5 && this.expiresAt.getTime() > Date.now();
};

export const PasswordResetToken =
  mongoose.models.PasswordResetToken ??
  mongoose.model("PasswordResetToken", passwordResetTokenSchema);
