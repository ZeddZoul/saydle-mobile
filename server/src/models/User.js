import mongoose from "mongoose";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { PROFILE_FIELDS } from "../config/profileFields.js";
import { DEFAULT_LOCALE } from "../config/locales.js";
import { isEntitled } from "../services/subscription.service.js";
import { SOURCES } from "../config/subscription.js";

// The progressive-profile sub-schema is generated from the field config, so a
// new question added there needs no change here. Values are validated by zod on
// write (validators/profile.schema.js); the DB stays loosely typed on purpose so
// the option lists can evolve without a migration.
const profileShape = Object.fromEntries(
  PROFILE_FIELDS.map((f) => {
    if (f.kind === "multi") return [f.key, { type: [String], default: undefined }];
    if (f.kind === "number") return [f.key, { type: Number, default: undefined }];
    if (f.kind === "text") return [f.key, { type: String, default: undefined }];
    return [f.key, { type: String, default: undefined }];
  }),
);

// _id: false — this is an embedded bag of optional fields, not its own document.
const profileSubSchema = new mongoose.Schema(profileShape, { _id: false });

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // `select: false` so a stray `User.find()` can never leak the hash into a
    // response or a log. Ask for it explicitly with `.select("+passwordHash")`.
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    // Optional: the onboarding flow collects a display name only ("What should
    // we call you?"). Kept on the model for users who do provide it.
    lastName: { type: String, trim: true, maxlength: 60, default: "" },
    emailVerifiedAt: { type: Date, default: null },
    /**
     * Entitlement state.
     *
     * `verifiedAt` is the important field: it is set only by the RevenueCat
     * webhook, which has checked the receipt with Apple or Google. A client
     * saying "I bought it" is a hint to refresh, never proof — see
     * services/subscription.service.js.
     */
    subscription: {
      status: {
        type: String,
        enum: ["active", "expired", "none"],
        default: "none",
      },
      // Store product identifier, once there is a listing to have one.
      productId: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      // Where it was bought. `other` covers promotional grants, Stripe and
      // RevenueCat's own billing — real entitlement, no store receipt.
      source: { type: String, enum: SOURCES, default: null },
      // Null until a receipt has actually been checked by the store.
      verifiedAt: { type: Date, default: null },
      /**
       * The last webhook event applied, so a redelivery is dropped rather
       * than replayed and an event that arrives out of order cannot roll a
       * renewal back to the cancellation that preceded it. RevenueCat retries
       * and does not promise ordering; this is what makes that safe.
       */
      lastEventId: { type: String, default: null },
      lastEventAt: { type: Date, default: null },
    },
    // IANA zone, used to decide when a user's daily affirmation rolls over
    // and when reminders fire.
    timezone: { type: String, default: "UTC" },
    // The language affirmations are written in. Gated to languages whose safety
    // rules and curated bank exist — see config/locales.js.
    locale: { type: String, default: DEFAULT_LOCALE },
    // Everything here feeds the per-request tail of the generation prompt.
    // None of it belongs in the cached prefix — see prompts/affirmation.prompt.js.
    preferences: {
      categories: { type: [String], default: [] },
      tone: {
        type: String,
        enum: ["gentle", "grounded", "energetic"],
        default: "grounded",
      },
      // Free text the user writes about what they want to focus on. Treated as
      // untrusted data everywhere it is used.
      focus: { type: String, default: "", maxlength: 500 },
      // The backdrop the daily affirmation is read against. Slug only — the
      // palette itself lives on the client (theme/themes.js).
      theme: { type: String, default: "dawn" },
      useFirstName: { type: Boolean, default: true },
      // Reminders are delivered as LOCAL notifications from the device, so these
      // are settings to sync across installs — the server never sends a push.
      // Stored as a window ("N times between start and end") rather than a flat
      // list, so the settings screen round-trips exactly what the user chose.
      // The device spreads it into concrete times when scheduling.
      reminders: {
        enabled: { type: Boolean, default: false },
        count: { type: Number, default: 3, min: 0, max: 20 },
        start: { type: String, default: "09:00" }, // "HH:MM", device-local
        end: { type: String, default: "22:00" },
      },
      /**
       * Which of the five voices reads the listening session.
       *
       * Lives here rather than on the device because this is what decides which
       * voice we pay to render in, and the render happens on the server.
       *
       * A change takes effect the NEXT local day, never today: today's seven
       * lines are already rendered and cached per (text, voiceId), so switching
       * now would discard them and bill us to render the same sentences again.
       * `pendingFrom` is a plain YYYY-MM-DD in the reader's own day, resolved on
       * read — there is no reliable moment to run a migration for a phone that
       * may not be open at midnight.
       */
      voice: {
        active: { type: String, default: "" },
        pending: { type: String, default: "" },
        pendingFrom: { type: String, default: "" },
      },
    },
    // Optional, ever-expandable personalization collected after signup via
    // progressive nudges. Every field is optional; none gates the app.
    profile: { type: profileSubSchema, default: () => ({}) },

    /**
     * Where they are in the scrollable library.
     *
     * A position, not a set. The batch is an ordered list, so "what have they
     * seen" is answered by one integer rather than by a row per line — which is
     * what makes forty-new-a-day cost nothing to track. `batchAt` is what makes
     * a batch stale; `generatingUntil` is the same cross-instance claim the
     * daily replenish uses, for the same reason.
     */
    library: {
      cursor: { type: Number, default: 0 },
      batchAt: { type: Date, default: null },
      // Snapshot of profile completeness when the batch was written, so drift
      // can be measured against it later.
      batchProfilePercent: { type: Number, default: 0 },
      generatingUntil: { type: Date, default: null },
    },

    /**
     * Set when someone asks to leave; cleared if they change their mind.
     *
     * Both fields move together and are the *only* record of a pending
     * deletion — there is no boolean, because a flag and a date can disagree
     * and then nobody knows which one the purge should believe.
     *
     * The account stays fully usable while these are set. See
     * config/deletion.js for why.
     */
    /**
     * One affirmation written for this person at signup, kept forever.
     *
     * Shown on the paywall as proof rather than promise. Never regenerated: a
     * second call would double a cost that buys nothing, since the point is one
     * honest example and not a fresh one.
     */
    sampleLine: { type: String, default: null },

    deletion: {
      requestedAt: { type: Date, default: null },
      // Indexed: the purge job's only query is "whose date has passed".
      purgeAfter: { type: Date, default: null, index: true },
      // Stamped when the day-25 nudge goes out, so it goes out once.
      remindedAt: { type: Date, default: null },
    },

    /**
     * Whoever is currently generating this reader's next batch, and until when.
     *
     * Topping the pool up is expensive and slow, and every read tries to start
     * it. One process can dedupe that in memory; two cannot see each other's
     * memory, so behind a load balancer each instance would bill us for the
     * same batch. This is the claim they all compete for — see
     * `affirmation.service.js`.
     *
     * A deadline rather than a boolean, because a process that dies mid-batch
     * must not lock a reader out of generation forever. It is never read
     * directly: `null` and "expired" mean the same thing, so only the atomic
     * claim interprets it.
     */
    replenishingUntil: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;

        // Derived here rather than stored, so a trial that ran out overnight is
        // expired the next time anyone asks — no sweep job, no stale flag.
        if (ret.subscription) {
          // eslint-disable-next-line no-unused-vars -- stripped, not shipped
          const { lastEventId, lastEventAt, ...subscription } = ret.subscription;
          ret.subscription = {
            ...subscription,
            entitled: isEntitled({ subscription }),
          };
        }

        // Every authenticated response carries this, which is what lets the app
        // raise "you asked us to delete this — keep it?" the moment someone
        // signs back in. `remindedAt` is ours, not theirs, and stays server-side.
        ret.deletion = {
          pending: Boolean(ret.deletion?.purgeAfter),
          requestedAt: ret.deletion?.requestedAt ?? null,
          purgeAfter: ret.deletion?.purgeAfter ?? null,
        };

        return ret;
      },
    },
  },
);

userSchema.methods.verifyPassword = function verifyPassword(plaintext) {
  if (!this.passwordHash) {
    throw new Error("passwordHash not loaded — select it explicitly before verifying");
  }
  return argonVerify(this.passwordHash, plaintext);
};

export async function hashPassword(plaintext) {
  return argonHash(plaintext);
}

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
