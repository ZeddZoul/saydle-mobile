import crypto from "node:crypto";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Tombstone } from "../models/Tombstone.js";
import { Affirmation } from "../models/Affirmation.js";
import { FeedEntry } from "../models/FeedEntry.js";
import { Favorite } from "../models/Favorite.js";
import { Saved } from "../models/Saved.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { EmailVerificationToken } from "../models/EmailVerificationToken.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { VoiceClip } from "../models/VoiceClip.js";
import { tombstoneKey } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { tombstoneExpiryFrom } from "../config/deletion.js";

/**
 * Erasing an account, for real.
 *
 * Everything that describes a person goes. What survives is a tombstone with no
 * name, no address and no profile in it — see models/Tombstone.js for why that
 * is allowed to exist at all.
 */

/**
 * Every collection that holds something belonging to one reader.
 *
 * Kept as a list rather than seven inline calls because the failure mode here is
 * *forgetting one*, and a forgotten collection leaves personal data behind
 * silently, in a feature whose entire promise is that it did not. A new
 * user-scoped collection must be added here, and the test that walks this list
 * is what makes that a failing build rather than a quiet leak.
 */
const OWNED = [
  { model: FeedEntry, field: "user" },
  { model: Favorite, field: "user" },
  { model: Saved, field: "user" },
  { model: Affirmation, field: "user" },
  { model: RefreshToken, field: "user" },
  { model: EmailVerificationToken, field: "user" },
  { model: PasswordResetToken, field: "user" },
  // Only their own words are keyed on a person; shared clips have `user: null`
  // and belong to nobody, so this removes exactly the private ones.
  { model: VoiceClip, field: "user" },
];

/**
 * Rows created this close to the sweep are not orphans yet.
 *
 * The sweep takes a snapshot of who exists and then walks each collection. An
 * account registered between the two has rows the snapshot has never heard
 * of, and without this window their first refresh token and feed would be
 * swept as belonging to nobody. Five minutes is far longer than either step.
 */
export const ORPHAN_GRACE_MS = 5 * 60 * 1000;

/**
 * One-way hash of an address.
 *
 * Keyed, not a bare digest: email addresses come from a small enough space that
 * an unkeyed SHA of one is recoverable from a wordlist in seconds. The key is
 * TOMBSTONE_HMAC_KEY, dedicated to this: it used to borrow the refresh secret,
 * which meant rotating a leaked auth secret silently broke matching every
 * tombstone written before it. Outside production it still falls back to that
 * secret so a laptop needs no extra setup — see config/env.js.
 */
export function hashEmail(email) {
  return crypto
    .createHmac("sha256", tombstoneKey)
    .update(String(email).trim().toLowerCase())
    .digest("hex");
}

/**
 * Erase one account and leave its tombstone.
 *
 * Order matters. The tombstone is written *first*: if the process dies midway,
 * a tombstone with some data still attached is recoverable — a purge with no
 * tombstone means a billing record that can never be reconciled again.
 *
 * Safe to run twice. Both halves are idempotent, so a retry after a crash
 * finishes the job rather than failing on what it already did.
 */
export async function purgeAccount(user, { now = new Date() } = {}) {
  const id = user._id;

  await Tombstone.updateOne(
    { user: id },
    {
      $setOnInsert: {
        user: id,
        emailHash: hashEmail(user.email),
        accountCreatedAt: user.createdAt,
        deletionRequestedAt: user.deletion?.requestedAt ?? null,
        purgedAt: now,
        subscription: {
          status: user.subscription?.status ?? "none",
          productId: user.subscription?.productId ?? null,
          expiresAt: user.subscription?.expiresAt ?? null,
          trialEndsAt: user.subscription?.trialEndsAt ?? null,
          source: user.subscription?.source ?? null,
          verifiedAt: user.subscription?.verifiedAt ?? null,
        },
        expiresAt: tombstoneExpiryFrom(now),
      },
    },
    { upsert: true },
  );

  const removed = {};
  for (const { model, field } of OWNED) {
    const { deletedCount } = await model.deleteMany({ [field]: id });
    removed[model.modelName] = deletedCount;
  }

  // Shared clips they happened to be the first to play stay — they belong to
  // the line, not to them — but the record of who paid for the render goes.
  await VoiceClip.updateMany({ renderedFor: id }, { $set: { renderedFor: null } });

  await User.deleteOne({ _id: id });

  logger.info({ userId: String(id), removed }, "account purged");
  return { removed };
}

/**
 * Purge everything whose grace period has run out.
 *
 * Claimed one account at a time with an atomic update, for the same reason
 * generation is: two instances running this on a schedule must not both take the
 * same account. Losing the race here is harmless — the winner deletes it and the
 * loser's next query simply does not see it — but doing the work twice would
 * mean two tombstones fighting over one unique index.
 */
export async function purgeDueAccounts({ now = new Date(), limit = 100 } = {}) {
  const purged = [];

  for (let i = 0; i < limit; i += 1) {
    // Claimed by clearing the date: whoever wins the update owns the account,
    // and it can never be handed to a second worker.
    const user = await User.findOneAndUpdate(
      { "deletion.purgeAfter": { $ne: null, $lte: now } },
      { $set: { "deletion.purgeAfter": null } },
      { new: false, sort: { "deletion.purgeAfter": 1 } },
    );

    if (!user) break;

    try {
      await purgeAccount(user, { now });
      purged.push(String(user._id));
    } catch (err) {
      // Hand it back rather than dropping it: an account that failed to purge
      // must be retried, not silently left half-erased and unscheduled.
      await User.updateOne(
        { _id: user._id },
        { $set: { "deletion.purgeAfter": user.deletion.purgeAfter } },
      ).catch(() => {});

      logger.error({ err, userId: String(user._id) }, "purge failed — rescheduled");
      throw err;
    }
  }

  if (purged.length > 0) logger.info({ count: purged.length }, "purged due accounts");
  return { purged };
}

/**
 * Rows whose owner no longer exists.
 *
 * A backlog, not a routine: the old delete removed the user row and nothing
 * else, so every account deleted before this existed left its feed, favourites
 * and generated affirmations behind. Runs off the same script.
 */
export async function purgeOrphans({ now = new Date(), limit = 5000 } = {}) {
  const live = new Set((await User.find({}, { _id: 1 }).lean()).map((u) => String(u._id)));
  const removed = {};

  // An ObjectId carries its creation second, so "older than the cutoff" is a
  // range on _id rather than a field every collection would have to carry.
  const cutoff = mongoose.Types.ObjectId.createFromTime(
    Math.floor((now.getTime() - ORPHAN_GRACE_MS) / 1000),
  );

  for (const { model, field } of OWNED) {
    const rows = await model
      .find({ [field]: { $ne: null }, _id: { $lt: cutoff } }, { [field]: 1 })
      .limit(limit)
      .lean();

    const dead = rows.filter((r) => !live.has(String(r[field]))).map((r) => r._id);
    if (dead.length === 0) continue;

    const { deletedCount } = await model.deleteMany({ _id: { $in: dead } });
    removed[model.modelName] = deletedCount;
  }

  return { removed };
}
