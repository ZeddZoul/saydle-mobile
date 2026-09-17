import mongoose from "mongoose";
// Every model, imported for the side effect of registering its schema. A model
// missing from this list is a model whose indexes never reach production.
import "../src/models/User.js";
import "../src/models/RefreshToken.js";
import "../src/models/EmailVerificationToken.js";
import "../src/models/PasswordResetToken.js";
import "../src/models/Category.js";
import "../src/models/Affirmation.js";
import "../src/models/FeedEntry.js";
import "../src/models/Favorite.js";
import "../src/models/Saved.js";
import "../src/models/Tombstone.js";
import "../src/models/VoiceClip.js";

/**
 * Bring every collection's indexes in line with its schema.
 *
 * 001 and 002 hand-listed the indexes that existed when they were written.
 * Every model added since — tokens, saved lines, tombstones, voice clips —
 * declared its indexes in the schema and nowhere else, and `autoIndex` is off
 * in production, so none of them were ever built there: the unique index that
 * makes "one bookmark per line" true, the TTL that expires reset codes, the
 * lookup the purge runs on.
 *
 * `syncIndexes` is Mongoose's own diff: it creates what the schema declares
 * and drops what it does not. That second half is why this is a migration and
 * not a boot step — an index dropped by accident is an outage, and a
 * migration is reviewed. It is also why every schema index has to be one we
 * mean: 001 and 002 built nothing the models do not still declare, which the
 * migrations test asserts.
 *
 * Idempotent by nature: a second run finds nothing to do.
 */
export async function up() {
  for (const model of Object.values(mongoose.models)) {
    await model.syncIndexes();
  }
}
