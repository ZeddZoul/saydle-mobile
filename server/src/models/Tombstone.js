import mongoose from "mongoose";

/**
 * What is left of an account after it has been erased.
 *
 * This is the answer to "we deleted everything, so how do we reconcile a payment
 * six months later?" — and it only works if it holds nothing that identifies a
 * person. There is no name here, no address, no profile, no affirmation: an
 * opaque id, some dates, and what was charged.
 *
 * The email is stored as an HMAC, never as text. That is enough to answer "did
 * an account with this address exist" or "which dead account does this webhook
 * belong to", and not enough to reconstruct who they were — which is the whole
 * difference between honouring a deletion request and pretending to.
 *
 * Retention is six years (config/deletion.js), the common EMEA floor for
 * financial records, and it is the reason we may keep even this much.
 */
const tombstoneSchema = new mongoose.Schema(
  {
    // The id the account used to have. Meaningless on its own, and the join key
    // for any billing record that outlives the person.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },

    // HMAC of the lowercased address. Indexed because looking up "was this
    // address ever here" is the only reason it exists.
    emailHash: { type: String, required: true, index: true },

    accountCreatedAt: { type: Date, required: true },
    deletionRequestedAt: { type: Date, default: null },
    purgedAt: { type: Date, required: true },

    /**
     * The billing trail, frozen. Copied rather than referenced: the account it
     * described is gone, and a dangling reference would be worse than useless
     * at the point someone actually needs to audit this.
     */
    subscription: {
      status: { type: String, default: "none" },
      productId: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      trialEndsAt: { type: Date, default: null },
      source: { type: String, default: null },
      verifiedAt: { type: Date, default: null },
    },

    /**
     * When this record may itself be dropped.
     *
     * A TTL index, so expiry is Mongo's job rather than another sweep of ours.
     * `expireAfterSeconds: 0` means "delete once this date passes" — the date is
     * already six years out when it is written.
     */
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: false },
);

export const Tombstone =
  mongoose.models.Tombstone ?? mongoose.model("Tombstone", tombstoneSchema);
