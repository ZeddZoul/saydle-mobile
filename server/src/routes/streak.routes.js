import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getStreak } from "../controllers/streak.controller.js";

export const streakRouter = Router();

streakRouter.use(requireAuth);
streakRouter.get("/", getStreak);
