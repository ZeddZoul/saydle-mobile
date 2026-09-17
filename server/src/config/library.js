import { env } from "./env.js";

/**
 * The scrollable library.
 *
 * A room next to the daily line, not a replacement for it. Today stays one
 * sentence — it anchors the widget, the share card and the streak. This is the
 * "more" someone reaches for when one line was not enough today.
 *
 * Every number here was measured rather than picked. See the table in
 * config/env.js for the token costs that produced them.
 */

/**
 * How many lines one generation produces.
 *
 * Measured: a 240-line batch costs 32.9 output-billed tokens per line, against
 * 88.5 for the 40-line batches the daily feed uses — 2.7x cheaper for the same
 * words, because the ~800-token prompt and the thinking budget are paid once
 * per call rather than once per forty lines. It takes 44-68s, which is why this
 * only ever runs in the background.
 */
export const BATCH_SIZE = env.LIBRARY_BATCH_SIZE;

/**
 * Refill when fewer than this many remain unread.
 *
 * The trigger is consumption, not the calendar. Someone who reads three lines a
 * day goes months without costing us a batch; someone who reads a hundred gets
 * a fresh one in two days. Neither of them ever sees the end of the list, which
 * is the only thing the number has to guarantee.
 */
export const REFILL_BELOW = env.LIBRARY_REFILL_BELOW;

/**
 * A batch older than this is stale even if it was never finished.
 *
 * Lines written against a profile from six days ago stop sounding like the
 * person who has since answered four more onboarding questions.
 */
export const STALE_AFTER_DAYS = env.LIBRARY_STALE_DAYS;

/**
 * How much of the profile has to change before the rest of the batch is worth
 * rewriting. Half is deliberately coarse: rewriting on every answer would throw
 * away lines they have already paid for and not yet read.
 */
export const PROFILE_DRIFT_PERCENT = env.LIBRARY_DRIFT_PERCENT;

/** Page size for the scroll. Big enough that the list never visibly stalls. */
export const PAGE_SIZE = env.LIBRARY_PAGE_SIZE;

/**
 * Premium from day one.
 *
 * Stated here rather than in the controller so that turning it off later — or
 * opening it during a promotion — is one edit in a file named after the
 * decision, not a hunt through route handlers.
 */
export const REQUIRES_PREMIUM = true;
