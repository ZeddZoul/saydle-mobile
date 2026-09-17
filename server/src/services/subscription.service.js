import { EVENT_STATUS, ENTITLEMENT_ID } from "../config/subscription.js";
import { logger } from "../lib/logger.js";

/**
 * Whether an account currently has premium access.
 *
 * Derived from dates rather than trusting `status`, because a stored status goes
 * stale the moment a date passes and nobody is going to run a sweep at midnight.
 */
export function isEntitled(user, now = new Date()) {
  const sub = user?.subscription;
  if (!sub) return false;

  if (sub.status === "active" && sub.expiresAt && sub.expiresAt > now) return true;
  // A lifetime or non-renewing purchase has no expiry to compare against.
  if (sub.status === "active" && !sub.expiresAt) return true;

  return false;
}

/** What the client needs to decide what to show. Never leaks receipt internals. */
export function serializeSubscription(user, now = new Date()) {
  const sub = user?.subscription ?? {};

  return {
    // One line written for this person at signup. The paywall shows it as proof
    // rather than promise — null is fine, and the card simply omits it.
    sampleLine: user?.sampleLine ?? null,
    entitled: isEntitled(user, now),
    status: sub.status ?? "none",
    expiresAt: sub.expiresAt ?? null,
    source: sub.source ?? null,
    // The client uses this to decide whether to trust its own cached copy: an
    // unverified entitlement is one nobody has checked with a store.
    verified: Boolean(sub.verifiedAt),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Grants premium by hand, with no store involved.
 *
 * The paywall is hard, so an App Review reviewer who cannot buy sees only the
 * curated bank — not Practice, the shelf, My Words or the listening session,
 * which is most of what the listing describes. This is how the demo account
 * gets the real product. It is also the honest way to comp someone.
 *
 * `verifiedAt` is deliberately left alone. `applyWebhookEvent` is the only path
 * allowed to set it, because it is the only one behind a receipt a store has
 * checked. Nothing has been checked here, so the billing screen correctly reads
 * "not confirmed" — which is the truth, and the reason `source` says
 * `promotional` rather than naming a store that was never asked.
 *
 * An expiry is always written rather than left null: a null expiry means
 * "lifetime" to `isEntitled`, and a comp that silently never ends is not a comp.
 */
export function grantPromotionalEntitlement(user, { days = 365, now = new Date() } = {}) {
  user.subscription.status = "active";
  user.subscription.source = "promotional";
  user.subscription.expiresAt = new Date(now.getTime() + days * DAY_MS);
  // No store product was bought, so claiming one would make the billing screen
  // name a product this account does not hold.
  user.subscription.productId = null;

  return user;
}

/**
 * Ends a hand-granted entitlement.
 *
 * Expired rather than erased: `source` and `expiresAt` stay as the record of
 * what happened, and `isEntitled` already refuses anything that is not active.
 */
export function revokePromotionalEntitlement(user, { now = new Date() } = {}) {
  user.subscription.status = "expired";
  user.subscription.expiresAt = now;

  return user;
}

/**
 * Applies a RevenueCat webhook event.
 *
 * This is the ONLY path that may set `verifiedAt`, because it is the only one
 * behind a receipt RevenueCat has already checked with Apple or Google.
 *
 * Returns false when the event says nothing we act on — an unknown type, or an
 * entitlement that isn't ours. Ignoring those is deliberate: treating an
 * unrecognised event as a cancellation would revoke access on a RevenueCat
 * release note.
 */
export function applyWebhookEvent(user, event, { now = new Date() } = {}) {
  const status = EVENT_STATUS[event?.type];

  if (!status) {
    logger.info({ type: event?.type }, "ignoring unrecognised subscription event");
    return false;
  }

  const entitlements =
    event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  if (entitlements.length > 0 && !entitlements.includes(ENTITLEMENT_ID)) {
    logger.info({ entitlements }, "ignoring event for another entitlement");
    return false;
  }

  user.subscription.status = status;
  user.subscription.productId = event.product_id ?? user.subscription.productId;
  // The grace period expiry wins when there is one. During a billing retry the
  // original expiry has already passed, so reading that would expire someone
  // Apple still considers a subscriber. A null expiry stays null: that is a
  // lifetime or non-renewing purchase, which `isEntitled` treats as no expiry.
  const expiry = event.grace_period_expiration_at_ms ?? event.expiration_at_ms;
  user.subscription.expiresAt = expiry ? new Date(expiry) : null;
  user.subscription.source = event.store === "PLAY_STORE" ? "play_store" : "app_store";
  user.subscription.verifiedAt = now;

  return true;
}
