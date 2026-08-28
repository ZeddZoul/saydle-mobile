/**
 * Account deletion policy.
 *
 * Deleting an account is two steps, not one. Asking to leave *marks* the
 * account and sets a date; a scheduled purge erases it once that date passes.
 * The gap between them exists so a decision made in a bad hour is recoverable —
 * which is a reasonable thing to build into an app about being kind to yourself.
 *
 * The numbers here are the policy. They are deliberately in one file so the
 * question "how long do we keep X" has exactly one answer, and so changing it
 * is a visible commit rather than an edit buried in a service.
 */

/**
 * How long someone has to change their mind.
 *
 * Login must keep working for the whole window — it is how the account is
 * recovered. Blocking sign-in during the grace period turns "you can cancel"
 * into a promise the app cannot keep.
 */
export const GRACE_DAYS = Number(process.env.DELETION_GRACE_DAYS ?? 30);

/**
 * When we nudge them, a few days out. Late enough that it isn't nagging, early
 * enough to still be a warning rather than a receipt.
 */
export const REMINDER_DAYS_BEFORE = Number(process.env.DELETION_REMINDER_DAYS ?? 5);

/**
 * How long the billing tombstone outlives the account.
 *
 * Six years is the common EMEA retention floor for financial records. It covers
 * the *payment* trail only — never the person. What survives a purge carries no
 * name, no address, no profile: an opaque id, some dates, and what was charged.
 *
 * Not legal advice, and not a number to change on a hunch: it is the reason we
 * are allowed to keep anything at all after someone asks to be forgotten.
 */
export const BILLING_RETENTION_YEARS = Number(process.env.BILLING_RETENTION_YEARS ?? 6);

/** Pending accounts stop costing us model time — the curated bank covers them. */
export const PAUSE_GENERATION_WHEN_PENDING = true;

/** The instant a request made `now` becomes eligible for purging. */
export function purgeDateFrom(now = new Date()) {
  const at = new Date(now);
  at.setUTCDate(at.getUTCDate() + GRACE_DAYS);
  return at;
}

/** The instant a tombstone written `now` may itself be dropped. */
export function tombstoneExpiryFrom(now = new Date()) {
  const at = new Date(now);
  at.setUTCFullYear(at.getUTCFullYear() + BILLING_RETENTION_YEARS);
  return at;
}
