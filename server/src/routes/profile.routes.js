import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { perUserLimiter } from "../middleware/rateLimit.js";
import { profilePatchSchema } from "../validators/profile.schema.js";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get("/", getProfile);
// Same reason as preferences: a profile change can rebuild the feed.
profileRouter.patch(
  "/",
  perUserLimiter({ max: 20 }),
  validate(profilePatchSchema),
  updateProfile,
);
