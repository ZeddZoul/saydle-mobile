/**
 * Run the account purge.
 *
 * Deliberately a script rather than a timer inside the API. A cron entry, a
 * Cloud Run job or a GitHub Action can all call this, and a server that happens
 * to be restarting at 03:00 does not silently skip a day of deletions. It is
 * also the only way to run it by hand, which is what you want the first time.
 *
 *   pnpm --filter @saydle/server purge            # due accounts
 *   pnpm --filter @saydle/server purge --orphans  # the pre-grace-period backlog
 *
 * Exits non-zero on failure so a scheduler notices.
 */
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { logger } from "../src/lib/logger.js";
import { purgeDueAccounts, purgeOrphans } from "../src/services/purge.service.js";

const wantsOrphans = process.argv.includes("--orphans");

try {
  await mongoose.connect(env.MONGODB_URI);

  const { purged } = await purgeDueAccounts();
  logger.info({ count: purged.length }, "purge run complete");

  if (wantsOrphans) {
    const { removed } = await purgeOrphans();
    logger.info({ removed }, "orphaned rows removed");
  }

  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  logger.error({ err }, "purge run failed");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}
