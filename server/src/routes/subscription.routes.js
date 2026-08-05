import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as subscription from "../controllers/subscription.controller.js";

export const subscriptionRouter = Router();

subscriptionRouter.get("/", requireAuth, subscription.getSubscription);
subscriptionRouter.post("/trial", requireAuth, subscription.beginTrial);

// No requireAuth: RevenueCat is not a user. Its own shared secret is the
// authentication, checked in the controller.
subscriptionRouter.post("/webhook", subscription.revenueCatWebhook);
