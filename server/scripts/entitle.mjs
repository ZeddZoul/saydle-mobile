/**
 * Grant or revoke premium by hand, against whichever database MONGODB_URI names.
 *
 * Written for one job: App Review. The paywall is hard, so a reviewer who
 * cannot complete a purchase sees only the curated bank, and rejects the app
 * for features they could not reach. The demo account in
 * docs/store/review-notes.md needs to be entitled without a store, and this is
 * the only thing that does that.
 *
 *   pnpm --filter @saydle/server entitle review@saydle.com
 *   pnpm --filter @saydle/server entitle review@saydle.com --days 30
 *   pnpm --filter @saydle/server entitle review@saydle.com --revoke
 *
 * A deliberate non-feature: there is no flag to set `verifiedAt`. That belongs
 * to the RevenueCat webhook alone, and an entitlement this script wrote should
 * read as unverified everywhere, because no store ever confirmed it.
 *
 * Exits non-zero on failure so a mistyped address is noticed rather than
 * assumed to have worked.
 */
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import {
  grantPromotionalEntitlement,
  revokePromotionalEntitlement,
  serializeSubscription,
} from "../src/services/subscription.service.js";

const args = process.argv.slice(2);
const revoking = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"))?.toLowerCase();

const daysFlag = args.indexOf("--days");
const days = daysFlag === -1 ? 365 : Number(args[daysFlag + 1]);

if (!email) {
  console.error("Usage: entitle <email> [--days N] [--revoke]");
  process.exit(1);
}

if (!revoking && (!Number.isFinite(days) || days <= 0)) {
  console.error(`--days must be a positive number, got: ${args[daysFlag + 1]}`);
  process.exit(1);
}

try {
  await mongoose.connect(env.MONGODB_URI);

  // `email` is select:false on the model, so it has to be asked for explicitly.
  const user = await User.findOne({ email }).select("+email");

  if (!user) {
    // Naming the database matters here: the most likely mistake is running this
    // against a laptop while expecting it to reach production.
    console.error(`No account for ${email} in "${mongoose.connection.name}".`);
    process.exit(1);
  }

  const before = serializeSubscription(user);

  if (revoking) revokePromotionalEntitlement(user);
  else grantPromotionalEntitlement(user, { days });

  await user.save();

  const after = serializeSubscription(user);

  console.log(`${email} in "${mongoose.connection.name}"`);
  console.log(`  before : entitled=${before.entitled} status=${before.status}`);
  console.log(
    `  after  : entitled=${after.entitled} status=${after.status}` +
      ` source=${after.source} expires=${after.expiresAt?.toISOString().slice(0, 10) ?? "never"}`,
  );
  console.log(`  verified: ${after.verified} (no store was asked, and that is correct)`);

  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error(err?.message ?? err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}
