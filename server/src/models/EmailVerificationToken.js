import mongoose from "mongoose";

/**
 * A pending email-verification code.
 *
 * Same shape and same reasoning as PasswordResetToken: only the SHA-256 is
 * stored, and `attempts` — not the six digits — is the security boundary.
 *
 * Kept as its own collection rather than sharing one with password resets so a
 * code issued for one purpose can never be presented for the other. That is a
 * real class of bug: a verification code mailed to an address someone typed by
 * mistake must not be usable to change a password.
 *
 * The TTL is longer than a reset's, because verification is not urgent and a
 * code that dies while someone walks to their laptop is just friction.
 */
const emailVerificationTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // The address the code was sent to. Stored so a code cannot be replayed
    // after the user changes their email to something else.
    email: { type: String, required: true },
    codeHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Mongo sweeps expired codes on its own. Lazy (~60s), so never rely on it for an
// auth decision — `isUsable()` is the authority.
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

emailVerificationTokenSchema.methods.isUsable = function isUsable() {
  return this.usedAt === null && this.attempts < 5 && this.expiresAt.getTime() > Date.now();
};

export const EmailVerificationToken =
  mongoose.models.EmailVerificationToken ??
  mongoose.model("EmailVerificationToken", emailVerificationTokenSchema);
