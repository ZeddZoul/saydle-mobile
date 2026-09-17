import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { perUserLimiter } from "../middleware/rateLimit.js";
import { voiceSessionSchema, voicePreferenceSchema } from "../validators/voice.schema.js";
import * as ctrl from "../controllers/voice.controller.js";

export const voiceRouter = Router();

/**
 * Clips are fetched by an audio player, not by our fetch client, so the token
 * never reaches them. A shared clip is safe to serve unauthenticated: the id
 * is a Mongo id for a rendered *line* — no user is attached, and two readers
 * given the same line share the same one by design. A private clip (someone's
 * own words) is served only under the signed URL its session handed out; the
 * controller checks that.
 */
voiceRouter.get("/clip/:id", ctrl.clip);

// Same reasoning as clips: a preview belongs to a voice, not to a person, and
// the five of them are shared by everyone.
voiceRouter.get("/preview/:key", ctrl.preview);

voiceRouter.use(requireAuth);
voiceRouter.get("/preference", ctrl.getVoice);
voiceRouter.put("/preference", validate(voicePreferenceSchema), ctrl.setVoice);
// Thirty sessions a quarter-hour is several times what a person listens to;
// it is a ceiling on a script, not on a reader.
voiceRouter.post(
  "/session",
  perUserLimiter({ max: 30 }),
  validate(voiceSessionSchema),
  ctrl.session,
);
