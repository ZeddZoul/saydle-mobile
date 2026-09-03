import mongoose from "mongoose";

/**
 * One document per issued refresh token.
 *
 * Only the SHA-256 of the token is stored, so a database dump does not hand an
 * attacker usable sessions. Tokens are grouped into a `family`: rotating a token
 * issues a successor in the same family, and presenting an already-rotated token
 * revokes the entire family (the classic stolen-token signal).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    // Set when this token is rotated, so a replay is distinguishable from a
    // token that was simply revoked at logout.
    rotatedAt: { type: Date, default: null },
    /**
     * When the family was first issued — the sign-in this chain descends
     * from. Copied to every successor, so the family's absolute age is one
     * read rather than a walk back through its ancestors. Null on rows from
     * before it existed; those fall back to their own createdAt.
     */
    familyIssuedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo drops documents once `expiresAt` passes, so expired sessions clean
// themselves up. Deletion is lazy (~60s sweep), never rely on it for auth
// decisions — `isUsable()` is the authority.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.methods.isUsable = function isUsable() {
  return (
    this.revokedAt === null && this.rotatedAt === null && this.expiresAt.getTime() > Date.now()
  );
};

export const RefreshToken =
  mongoose.models.RefreshToken ?? mongoose.model("RefreshToken", refreshTokenSchema);
