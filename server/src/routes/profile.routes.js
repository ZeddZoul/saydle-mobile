import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { profilePatchSchema } from "../validators/profile.schema.js";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get("/", getProfile);
profileRouter.patch("/", validate(profilePatchSchema), updateProfile);
