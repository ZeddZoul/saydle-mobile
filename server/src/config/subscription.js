/**
 * Subscription configuration.
 *
 * Every store-specific value is an env var, because none of them exist until an
 * App Store Connect / Play Console listing does. Nothing here is required to
 * boot: with the vars unset the app runs entirely on trials, which is exactly
 * what local development and the test suite want.
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

/** The trial someone gets by skipping the paywall. */

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
  CANCELLATION: "expired",
  EXPIRATION: "expired",
  BILLING_ISSUE: "expired",
  SUBSCRIPTION_PAUSED: "expired",
};
