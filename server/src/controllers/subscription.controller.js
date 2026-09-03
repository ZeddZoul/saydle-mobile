import crypto from "node:crypto";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { webhookSecret, TRANSFER_EVENT } from "../config/subscription.js";
import {
  applyWebhookEvent,
  applyTransfer,
  isStaleEvent,
  serializeSubscription,
} from "../services/subscription.service.js";

export function getSubscription(req, res) {
  res.json({ subscription: serializeSubscription(req.user) });
}

/**
 * Every id RevenueCat might know this account by, most specific first.
 *
 * The app tells RevenueCat our user id at configure() time, so `app_user_id`
 * is normally ours. But a purchase made before sign-in lives under an
 * anonymous id that RevenueCat later aliases to the real one, and an event
 * can arrive under either — so the aliases and the original id are tried too.
 */
function candidateIds(event) {
  const ids = [event?.app_user_id, ...(event?.aliases ?? []), event?.original_app_user_id];
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

/** The first of these ids that is one of our accounts. */
async function findUser(ids) {
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) continue;
    const user = await User.findById(id);
    if (user) return user;
  }
  return null;
}

/** Every one of these ids that is one of our accounts. */
async function findUsers(ids) {
  const valid = ids.filter((id) => mongoose.isValidObjectId(id));
  return valid.length === 0 ? [] : User.find({ _id: { $in: valid } });
}

/**
 * RevenueCat webhook — the only source of verified entitlement.
 *
 * The client never gets to assert that it paid. It can only ask us to re-read
 * what the store told RevenueCat, which told us here.
 *
 * Auth is the shared secret RevenueCat sends in the Authorization header,
 * compared in constant time. With no secret configured the endpoint refuses
 * everything: an unauthenticated entitlement endpoint is a free subscription.
 *
 * Always 204 once authenticated, even for events we drop: anything else and
 * RevenueCat retries forever.
 */
export async function revenueCatWebhook(req, res, next) {
  try {
    const secret = webhookSecret();

    if (!secret) {
      req.log?.error("subscription webhook hit with no REVENUECAT_WEBHOOK_SECRET set");
      throw AppError.unauthorized("Webhook is not configured.");
    }

    const provided = req.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;

    // Constant time, and length-guarded because timingSafeEqual throws on a
    // length mismatch — which would itself be a timing signal.
    const ok =
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    if (!ok) throw AppError.unauthorized("Invalid webhook signature.");

    const event = req.body?.event;
    if (!event || typeof event !== "object") throw AppError.badRequest("Event is missing.");

    if (event.type === TRANSFER_EVENT) {
      await handleTransfer(req, event);
      return res.status(204).end();
    }

    const ids = candidateIds(event);
    if (ids.length === 0) throw AppError.badRequest("Event is missing app_user_id.");

    const user = await findUser(ids);

    if (!user) {
      // A deleted account still gets events for a while. Acknowledge, or
      // RevenueCat retries forever.
      req.log?.info({ userId: ids[0] }, "subscription event for unknown user");
      return res.status(204).end();
    }

    const stale = isStaleEvent(user, event);
    if (stale) {
      req.log?.info(
        { userId: user.id, eventId: event.id, type: event.type, reason: stale },
        "subscription event dropped",
      );
      return res.status(204).end();
    }

    if (applyWebhookEvent(user, event)) {
      await user.save();
      req.log?.info(
        { userId: user.id, type: event.type, status: user.subscription.status },
        "subscription updated",
      );
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * A TRANSFER touches several accounts at once. Each is checked for staleness
 * on its own — the same event may have already reached one of them via an
 * earlier delivery — and each that changed is saved.
 */
async function handleTransfer(req, event) {
  const fromIds = Array.isArray(event.transferred_from) ? event.transferred_from : [];
  const toIds = Array.isArray(event.transferred_to) ? event.transferred_to : [];

  const [from, to] = await Promise.all([findUsers(fromIds), findUsers(toIds)]);
  const fresh = (users) => users.filter((u) => !isStaleEvent(u, event));

  const changed = applyTransfer({ from: fresh(from), to: fresh(to) }, event);
  await Promise.all(changed.map((u) => u.save()));

  req.log?.info(
    {
      eventId: event.id,
      from: from.map((u) => u.id),
      to: to.map((u) => u.id),
      changed: changed.length,
    },
    "subscription transferred",
  );
}
