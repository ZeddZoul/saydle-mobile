import { TRIAL_DAYS, EVENT_STATUS, ENTITLEMENT_ID } from "../config/subscription.js";
import { logger } from "../lib/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an account currently has premium access.
 *
 * Derived from dates rather than trusting `status`, because a stored status goes
 * stale the moment a date passes and nobody is going to run a sweep at midnight.
 * An expired trial and an expired subscription are the same answer here.
 */
export function isEntitled(user, now = new Date()) {
  const sub = user?.subscription;
  if (!sub) return false;

  if (sub.status === "active" && sub.expiresAt && sub.expiresAt > now) return true;
  // A lifetime or non-renewing purchase has no expiry to compare against.
  if (sub.status === "active" && !sub.expiresAt) return true;
  if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt > now) return true;

  return false;
}

/** What the client needs to decide what to show. Never leaks receipt internals. */
export function serializeSubscription(user, now = new Date()) {
  const sub = user?.subscription ?? {};

  return {
    entitled: isEntitled(user, now),
    status: sub.status ?? "none",
    expiresAt: sub.expiresAt ?? null,
    trialEndsAt: sub.trialEndsAt ?? null,
    source: sub.source ?? null,
    // The client uses this to decide whether to trust its own cached copy: an
    // unverified entitlement is one nobody has checked with a store.
    verified: Boolean(sub.verifiedAt),
  };
}

/**
 * Starts the free trial someone gets for skipping the paywall.
 *
 * Idempotent and one-way: a second call cannot extend a trial or resurrect a
 * finished one, which is what stops "delete and reinstall" being a subscription.
 */
export function startTrial(user, { now = new Date(), days = TRIAL_DAYS } = {}) {
  if (user.subscription?.trialEndsAt) return false;

  user.subscription.status = "trialing";
  user.subscription.trialEndsAt = new Date(now.getTime() + days * DAY_MS);
  user.subscription.source = "trial";
  // Deliberately not verified: a trial is something we granted, not something a
  // store confirmed.
  user.subscription.verifiedAt = null;

  return true;
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
  user.subscription.expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms)
    : null;
  user.subscription.source = event.store === "PLAY_STORE" ? "play_store" : "app_store";
  user.subscription.verifiedAt = now;

  return true;
}
