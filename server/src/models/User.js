import mongoose from "mongoose";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { PROFILE_FIELDS } from "../config/profileFields.js";
import { DEFAULT_LOCALE } from "../config/locales.js";
import { isEntitled } from "../services/subscription.service.js";

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
        enum: ["trialing", "active", "expired", "none"],
        default: "none",
      },
      // Store product identifier, once there is a listing to have one.
      productId: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      trialEndsAt: { type: Date, default: null },
      // "trial" | "app_store" | "play_store" | "promotional"
      source: { type: String, default: null },
      // Null until a receipt has actually been checked by the store.
      verifiedAt: { type: Date, default: null },
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
    },
    // Optional, ever-expandable personalization collected after signup via
    // progressive nudges. Every field is optional; none gates the app.
    profile: { type: profileSubSchema, default: () => ({}) },
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
          ret.subscription = {
            ...ret.subscription,
            entitled: isEntitled({ subscription: ret.subscription }),
          };
        }

        return ret;
      },
    },
  },
);

userSchema.methods.verifyPassword = function verifyPassword(plaintext) {
  if (!this.passwordHash) {
    throw new Error(
      "passwordHash not loaded — select it explicitly before verifying",
    );
  }
  return argonVerify(this.passwordHash, plaintext);
};

export async function hashPassword(plaintext) {
  return argonHash(plaintext);
}

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
