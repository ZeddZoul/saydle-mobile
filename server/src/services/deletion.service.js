import { GRACE_DAYS, purgeDateFrom } from "../config/deletion.js";

/**
 * Scheduling and un-scheduling account deletion.
 *
 * Phase one: this marks and unmarks only. Nothing here destroys anything — the
 * purge is a separate, scheduled thing, and keeping the two apart is what makes
 * "I changed my mind" a supported path rather than a support ticket.
 */

/**
 * True while an account is counting down.
 *
 * Deliberately not time-aware: an account whose date has passed but which the
 * purge has not reached yet is still pending, and still cancellable. Whether it
 * is *due* is a separate question — see below.
 */
export function isPending(user) {
  return Boolean(user?.deletion?.purgeAfter && user?.deletion?.requestedAt);
}

/** True once the countdown has run out and the purge may take it. */
export function isDue(user, now = new Date()) {
  const at = user?.deletion?.purgeAfter;
  return Boolean(at) && new Date(at) <= now;
}

/**
 * Start the countdown.
 *
 * Idempotent on purpose: asking twice must not push the date further out. A
 * second request is someone tapping again because the first felt unconfirmed,
 * not a request for another thirty days.
 */
export function requestDeletion(user, { now = new Date() } = {}) {
  if (isPending(user)) return user;

  user.deletion = {
    requestedAt: now,
    purgeAfter: purgeDateFrom(now),
    remindedAt: null,
  };

  return user;
}

/**
 * Change of mind. Restores the account completely — there is nothing to undo,
 * because nothing was undone.
 */
export function cancelDeletion(user) {
  user.deletion = { requestedAt: null, purgeAfter: null, remindedAt: null };
  return user;
}

/** What the app needs to render the "keep my account?" card. */
export function serializeDeletion(user, now = new Date()) {
  if (!isPending(user)) return { pending: false, requestedAt: null, purgeAfter: null, daysLeft: null };

  const purgeAfter = new Date(user.deletion.purgeAfter);
  const msLeft = purgeAfter.getTime() - now.getTime();

  return {
    pending: true,
    requestedAt: user.deletion.requestedAt,
    purgeAfter,
    // Floored at zero rather than going negative: an account past its date but
    // not yet swept is still cancellable, and "-2 days left" helps nobody.
    daysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
    graceDays: GRACE_DAYS,
  };
}
