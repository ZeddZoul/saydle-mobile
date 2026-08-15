import { logger } from "../lib/logger.js";
import { purgeDueAccounts, purgeOrphans } from "./purge.service.js";
import { sendDeletionReminders, sendDeletionFarewells } from "./deletionMail.service.js";

/**
 * The clock behind account deletion.
 *
 * `purgeDueAccounts` has existed and been tested since the deletion work
 * landed, and nothing ever called it — so every account someone asked us to
 * delete was scheduled and then kept forever. A GDPR erasure request that is
 * recorded and never executed is worse than not offering one, because the
 * record says it happened.
 *
 * Deliberately an interval in-process rather than a cron daemon or a queue.
 * The work is idempotent, cheap, and bounded (`limit`), so running it twice
 * costs nothing and missing a tick only delays a purge by an hour — and one
 * fewer moving part is worth more here than precision. It is the same reasoning
 * as the widget's fortnight of affirmations: prefer the thing that cannot
 * silently stop.
 *
 * If Saydle ever runs more than one instance this stays correct: `purgeAccount`
 * writes the tombstone first and deletes by id, so two workers racing the same
 * account produce one tombstone and one deletion, not two of either.
 */
const HOUR_MS = 60 * 60 * 1000;

let timer = null;
let running = false;

/** One pass. Exported so tests and a future cron entrypoint can call it directly. */
export async function runDeletionSweep({ now = new Date() } = {}) {
  // Never two at once. A slow pass must not stack on the next tick and have two
  // workers walking the same accounts.
  if (running) return { skipped: true };
  running = true;

  const started = Date.now();
  const result = { purged: 0, reminded: 0, farewells: 0, orphans: 0, errors: 0 };

  try {
    // Reminders first: someone whose grace period ends today should have been
    // warned days ago, and warning them after we deleted them is worthless.
    try {
      result.reminded = await sendDeletionReminders({ now });
    } catch (err) {
      result.errors += 1;
      logger.error({ err }, "deletion reminders failed");
    }

    // Before the purge, never after: the tombstone keeps a hash of the email
    // and nothing that could address a message, so once this has run there is
    // no way left to reach them. A mail failure must not stop an erasure, which
    // is why it is its own try.
    try {
      result.farewells = await sendDeletionFarewells({ now });
    } catch (err) {
      result.errors += 1;
      logger.error({ err }, "deletion farewells failed");
    }

    try {
      // Returns { purged: [ids] }; the sweep reports counts.
      const { purged } = await purgeDueAccounts({ now });
      result.purged = purged.length;
    } catch (err) {
      result.errors += 1;
      logger.error({ err }, "purge sweep failed");
    }

    // Rows whose owner is already gone — a crash between the tombstone and the
    // deletes leaves these, and nothing else would ever collect them.
    try {
      result.orphans = await purgeOrphans();
    } catch (err) {
      result.errors += 1;
      logger.error({ err }, "orphan sweep failed");
    }

    const level = result.errors > 0 ? "warn" : "info";
    logger[level]({ ...result, ms: Date.now() - started }, "deletion sweep");

    return result;
  } finally {
    running = false;
  }
}

/**
 * Start sweeping.
 *
 * Runs once shortly after boot rather than immediately: a deploy should not
 * have deletion competing with the first requests, and a restart loop should
 * not sweep on every crash.
 */
export function startScheduler({ intervalMs = HOUR_MS, firstRunMs = 30_000 } = {}) {
  if (timer) return timer;

  const tick = () => runDeletionSweep().catch((err) => logger.error({ err }, "sweep threw"));

  setTimeout(tick, firstRunMs).unref();
  timer = setInterval(tick, intervalMs);
  // `unref` so the interval never holds the process open during shutdown.
  timer.unref();

  logger.info({ intervalMs, firstRunMs }, "deletion scheduler started");
  return timer;
}

export function stopScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
