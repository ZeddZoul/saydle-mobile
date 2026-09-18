import crypto from "node:crypto";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { webhookSecret } from "../config/subscription.js";
import { applyWebhookEvent, serializeSubscription } from "../services/subscription.service.js";

export function getSubscription(req, res) {
  res.json({ subscription: serializeSubscription(req.user) });
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

    if (!userId) {
      // TRANSFER is the event that brought this here: it moves a subscription
      // between app user ids and names them in `transferred_from` /
      // `transferred_to` rather than in `app_user_id`, so it arrived with none
      // and was answered 400 — which RevenueCat reads as a delivery failure and
      // retries, forever, for an event we were never going to act on.
      //
      // Acknowledged and logged instead. Deliberately NOT acted on: moving
      // entitlement off the from-account on an event shape we have never seen
      // in production risks locking out someone who is paying, and the
      // receiving account picks its entitlement up on the next renewal anyway.
      // If transfers turn out to be common, this log is where to start.
      req.log?.warn(
        { type: event?.type, from: event?.transferred_from, to: event?.transferred_to },
        "subscription event carried no app_user_id; acknowledged without acting",
      );

      return res.status(204).end();
    }

    const user = await User.findById(userId).catch(() => null);

    if (!user) {
      // An id RevenueCat minted rather than one of ours means a purchase
      // completed before `logIn` attached the customer to an account. The money
      // moved and nothing was granted, so this is not the same event as a
      // deleted account still receiving traffic, and it must not read like one.
      const stranded = typeof userId === "string" && userId.startsWith("$RCAnonymousID:");

      if (stranded) {
        req.log?.warn(
          { userId, type: event.type },
          "purchase arrived on an anonymous RevenueCat id and granted nothing",
        );
      } else {
        // A deleted account still gets events for a while. Acknowledge, or
        // RevenueCat retries forever.
        req.log?.info({ userId }, "subscription event for unknown user");
      }

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
