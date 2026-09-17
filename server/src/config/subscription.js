import { env } from "./env.js";

/**
 * Subscription configuration.
 *
 * Every store-specific value is an env var, because none of them exist until an
 * App Store Connect / Play Console listing does. Nothing here is required to
 * boot: with the vars unset the app runs unentitled, which is exactly what
 * local development and the test suite want.
 *
 * Receipts are never validated here. RevenueCat does that against Apple and
 * Google and tells us via webhook — see controllers/subscription.controller.js.
 * A client that simply *claims* to have paid is not evidence, and this file is
 * where that distinction is enforced.
 */

export const ENTITLEMENT_ID = env.REVENUECAT_ENTITLEMENT_ID;

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

/** Where a purchase was made, as we record it. */
export const SOURCES = ["app_store", "play_store", "other"];

/**
 * RevenueCat's store vocabulary, mapped onto ours.
 *
 * Only the two stores we can be listed in get their own value. Everything
 * else — promotional grants, Stripe, RevenueCat's own billing, Amazon — is
 * `other`: still a real entitlement, but not one a store receipt stands behind.
 */
export function mapStore(store) {
  switch (store) {
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "app_store";
    case "PLAY_STORE":
      return "play_store";
    default:
      return "other";
  }
}

/**
 * RevenueCat's event vocabulary, mapped onto ours.
 *
 * Anything unrecognised is deliberately absent rather than defaulted: a new
 * event type we don't understand should be logged and ignored, not silently
 * treated as a cancellation.
 *
 * The cancellation family is the subtle part. A CANCELLATION means "will not
 * renew", and the reader keeps what they paid for until `expiration_at_ms`,
 * which is why it stays `active` — `isEntitled` reads the date. A refund
 * arrives as a CANCELLATION whose expiry is already in the past, so the same
 * date check revokes it immediately. BILLING_ISSUE likewise keeps access for
 * the grace period the store grants. Only EXPIRATION and SUBSCRIPTION_PAUSED
 * say the access is actually over.
 */
export const EVENT_STATUS = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  NON_RENEWING_PURCHASE: "active",
  PRODUCT_CHANGE: "active",
  SUBSCRIPTION_EXTENDED: "active",
  CANCELLATION: "active",
  BILLING_ISSUE: "active",
  EXPIRATION: "expired",
  SUBSCRIPTION_PAUSED: "expired",
};

/** Moves an entitlement between app user ids. Handled separately — no single subject. */
export const TRANSFER_EVENT = "TRANSFER";
