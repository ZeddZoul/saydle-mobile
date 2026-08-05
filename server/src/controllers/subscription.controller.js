import crypto from "node:crypto";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { webhookSecret } from "../config/subscription.js";
import {
  applyWebhookEvent,
  serializeSubscription,
  startTrial,
} from "../services/subscription.service.js";

export function getSubscription(req, res) {
  res.json({ subscription: serializeSubscription(req.user) });
}

/**
 * Starts the free trial — what "skip" on the paywall does.
 *
 * Always 200 with the current state, even when the trial was already used: the
 * client's job is to render what it's given, and "you already had your trial" is
 * something the returned status says perfectly well on its own.
 */
export async function beginTrial(req, res, next) {
  try {
    if (startTrial(req.user)) {
      await req.user.save();
      req.log?.info({ userId: req.user.id }, "trial started");
    }

    res.json({ subscription: serializeSubscription(req.user) });
  } catch (err) {
    next(err);
  }
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
    // RevenueCat is told our user id as the app_user_id at configure() time.
    const userId = event?.app_user_id;

    if (!userId) throw AppError.badRequest("Event is missing app_user_id.");

    const user = await User.findById(userId).catch(() => null);

    if (!user) {
      // A deleted account still gets events for a while. Acknowledge, or
      // RevenueCat retries forever.
      req.log?.info({ userId }, "subscription event for unknown user");
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
