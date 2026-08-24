import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as ctrl from "../controllers/voice.controller.js";

export const voiceRouter = Router();

/**
 * Clips are fetched by an audio player, not by our fetch client, so the token
 * never reaches them. They are safe to serve unauthenticated: the id is a
 * Mongo id for a rendered *affirmation* — no user is attached to a clip, and
 * two readers given the same line share the same one by design.
 */
voiceRouter.get("/clip/:id", ctrl.clip);

voiceRouter.use(requireAuth);
voiceRouter.get("/preference", ctrl.getVoice);
voiceRouter.put("/preference", ctrl.setVoice);
voiceRouter.post("/session", ctrl.session);
