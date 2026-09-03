import {
  EVENT_STATUS,
  ENTITLEMENT_ID,
  TRANSFER_EVENT,
  mapStore,
} from "../config/subscription.js";
import { logger } from "../lib/logger.js";

/**
 * Whether an account currently has premium access.
 *
 * Derived from dates rather than trusting `status`, because a stored status goes
 * stale the moment a date passes and nobody is going to run a sweep at midnight.
 * A cancelled subscription inside its paid period and a live one are the same
 * answer here; so are an expired one and a refunded one.
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

const toDate = (ms) => (ms ? new Date(Number(ms)) : null);

/** True when this event is about our entitlement, or about no entitlement in particular. */
function concernsUs(event) {
  const entitlements =
    event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  return entitlements.length === 0 || entitlements.includes(ENTITLEMENT_ID);
}

/**
 * Has this event already been applied, or been overtaken by a later one?
 *
 * RevenueCat redelivers on any non-2xx and makes no ordering promise, so both
 * cases are routine rather than anomalies. Answering "skip" for either keeps a
 * RENEWAL from being rolled back by the CANCELLATION it superseded, and keeps
 * a redelivered EXPIRATION from re-expiring someone who has since resubscribed.
 */
export function isStaleEvent(user, event) {
  const sub = user?.subscription ?? {};

  if (event?.id && sub.lastEventId === event.id) return "replay";

  const at = Number(event?.event_timestamp_ms);
  if (Number.isFinite(at) && at > 0 && sub.lastEventAt && at < sub.lastEventAt.getTime()) {
    return "out_of_order";
  }

  return null;
}

function stamp(user, event, now) {
  user.subscription.verifiedAt = now;
  user.subscription.lastEventId = event.id ?? user.subscription.lastEventId;
  user.subscription.lastEventAt = toDate(event.event_timestamp_ms) ?? now;
}

/**
 * Applies a RevenueCat webhook event to its subject.
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

  if (!concernsUs(event)) {
    logger.info(
      { entitlements: event.entitlement_ids },
      "ignoring event for another entitlement",
    );
    return false;
  }

  const sub = user.subscription;
  sub.status = status;
  sub.productId = event.product_id ?? sub.productId;
  sub.source = mapStore(event.store);

  // A billing issue keeps access for the store's grace period, when it grants
  // one; otherwise until the period already paid for runs out.
  const expiry =
    event.type === "BILLING_ISSUE"
      ? (event.grace_period_expiration_at_ms ?? event.expiration_at_ms)
      : event.expiration_at_ms;
  sub.expiresAt = toDate(expiry);

  stamp(user, event, now);
  return true;
}

/**
 * Moves an entitlement between accounts.
 *
 * A TRANSFER names no single subject: `transferred_from` lose the entitlement
 * and `transferred_to` gain it. The event carries no expiry of its own, so the
 * recipient inherits the donor's — and when no donor is known to us, only an
 * expiry on the event itself is trusted. Granting an open-ended entitlement
 * on the strength of a transfer from nobody would be a free subscription.
 *
 * Returns the users that changed, for the caller to save.
 */
export function applyTransfer({ from = [], to = [] }, event, { now = new Date() } = {}) {
  if (event?.type !== TRANSFER_EVENT) return [];

  const changed = [];

  // The strongest donor: the one whose access runs longest, or one with no
  // expiry at all, which is a lifetime purchase.
  const donor = from
    .filter((u) => u?.subscription?.status === "active")
    .sort((a, b) => {
      const ax = a.subscription.expiresAt?.getTime() ?? Infinity;
      const bx = b.subscription.expiresAt?.getTime() ?? Infinity;
      return bx - ax;
    })[0];

  const inherited = donor
    ? {
        productId: donor.subscription.productId,
        expiresAt: donor.subscription.expiresAt,
        source: donor.subscription.source ?? mapStore(event.store),
      }
    : event.expiration_at_ms
      ? {
          productId: event.product_id ?? null,
          expiresAt: toDate(event.expiration_at_ms),
          source: mapStore(event.store),
        }
      : null;

  for (const user of from) {
    if (!user) continue;
    user.subscription.status = "expired";
    stamp(user, event, now);
    changed.push(user);
  }

  for (const user of to) {
    if (!user) continue;
    if (!inherited) {
      logger.warn(
        { userId: String(user._id), eventId: event.id },
        "transfer with no known donor and no expiry — not granting",
      );
      continue;
    }
    user.subscription.status = "active";
    user.subscription.productId = inherited.productId ?? user.subscription.productId;
    user.subscription.expiresAt = inherited.expiresAt;
    user.subscription.source = inherited.source;
    stamp(user, event, now);
    changed.push(user);
  }

  return changed;
}
