/**
 * Subscription configuration.
 *
 * Every store-specific value is an env var, because none of them exist until an
 * App Store Connect / Play Console listing does. Nothing here is required to
 * boot: with the vars unset nobody is ever entitled, which is exactly what
 * local development and the test suite want.
 *
 * Receipts are never validated here. RevenueCat does that against Apple and
 * Google and tells us via webhook — see controllers/subscription.controller.js.
 * A client that simply *claims* to have paid is not evidence, and this file is
 * where that distinction is enforced.
 */

export const ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID ?? "premium";

/**
 * Shared secret on the RevenueCat webhook. Unset means the webhook refuses
 * every request rather than accepting unauthenticated entitlement changes —
 * failing closed, because the alternative is a free-subscription endpoint.
 *
 * Read per call rather than captured at import: a module-level constant is
 * fixed by whatever the environment looked like when the file was first loaded,
 * which makes the "wrong secret is rejected" case impossible to test honestly.
 */
export const webhookSecret = () => process.env.REVENUECAT_WEBHOOK_SECRET ?? null;

export const STATUSES = ["active", "expired", "none"];

/**
 * RevenueCat's event vocabulary, mapped onto ours.
 *
 * Anything unrecognised is deliberately absent rather than defaulted: a new
 * event type we don't understand should be logged and ignored, not silently
 * treated as a cancellation.
 */
export const EVENT_STATUS = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  NON_RENEWING_PURCHASE: "active",
  PRODUCT_CHANGE: "active",
  SUBSCRIPTION_EXTENDED: "active",
  // Neither of these ends access, and treating them as if they did is how you
  // take away something someone has paid for.
  //
  // CANCELLATION means auto-renew was switched off. Someone who cancels on day
  // two of an annual subscription has bought 363 more days. RevenueCat also
  // reports refunds as CANCELLATION, and there the event carries an expiry of
  // now — so trusting `expiration_at_ms` gets both cases right and neither
  // needs a special case here.
  //
  // BILLING_ISSUE means a renewal payment failed while Apple retries the card.
  // Through the billing grace period the customer is still a subscriber, and
  // cutting them off is the grace period defeated: billed-retried and locked
  // out at the same time.
  CANCELLATION: "active",
  BILLING_ISSUE: "active",

  // A Play Store pause is scheduled, not immediate: it begins at the end of the
  // period already paid for, and `expiration_at_ms` carries that date. Marking
  // it expired here took away the days they had bought, which is the same
  // mistake as treating CANCELLATION as the end of access. Trusting the date
  // gets it right with no follow-up event needed — once the pause begins,
  // `isEntitled` stops returning true on its own.
  SUBSCRIPTION_PAUSED: "active",

  // This does end it. EXPIRATION fires when the term actually runs out, grace
  // period included.
  EXPIRATION: "expired",
};

/**
 * The only events where "no expiry" legitimately means forever.
 *
 * `isEntitled` reads an active subscription with no expiry as a lifetime one,
 * which is right for a one-off purchase and catastrophic for anything else: a
 * RENEWAL that arrived without `expiration_at_ms` would hand out permanent
 * access, and nothing would ever log it. Everywhere else a missing expiry means
 * the event did not carry one, and the honest response is to keep the expiry we
 * already had rather than to invent an unlimited one.
 */
export const LIFETIME_EVENTS = new Set(["NON_RENEWING_PURCHASE"]);
