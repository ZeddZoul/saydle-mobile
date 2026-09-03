import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { perUserLimiter } from "../middleware/rateLimit.js";
import {
  feedQuerySchema,
  historyQuerySchema,
  customAffirmationSchema,
  dateParamSchema,
  idParamSchema,
  preferencesSchema,
} from "../validators/affirmation.schema.js";
import * as ctrl from "../controllers/affirmation.controller.js";
import * as custom from "../controllers/custom.controller.js";

export const affirmationRouter = Router();

affirmationRouter.use(requireAuth);

affirmationRouter.get("/today", ctrl.today);
affirmationRouter.get("/feed", validate(feedQuerySchema, "query"), ctrl.feed);
affirmationRouter.get("/history", validate(historyQuerySchema, "query"), ctrl.history);
affirmationRouter.post("/feed/:date/seen", validate(dateParamSchema, "params"), ctrl.markSeen);

// Declared before "/:id/favorite" so "custom" is never read as an id.
affirmationRouter.get("/custom", custom.listCustom);
// Writing a line rebuilds the days ahead; limited so that cannot be looped.
affirmationRouter.post(
  "/custom",
  perUserLimiter({ max: 20 }),
  validate(customAffirmationSchema),
  custom.createCustom,
);
affirmationRouter.delete("/custom/:id", validate(idParamSchema, "params"), custom.deleteCustom);

affirmationRouter.get("/favorites", ctrl.listFavorites);
affirmationRouter.put("/:id/favorite", validate(idParamSchema, "params"), ctrl.addFavorite);
affirmationRouter.delete(
  "/:id/favorite",
  validate(idParamSchema, "params"),
  ctrl.removeFavorite,
);

export const categoryRouter = Router();
categoryRouter.get("/", requireAuth, ctrl.listCategories);

export const preferencesRouter = Router();
preferencesRouter.use(requireAuth);
preferencesRouter.get("/", ctrl.getPreferences);
// A preference change can regenerate the feed, so the write is limited even
// though the read is not.
preferencesRouter.patch(
  "/",
  perUserLimiter({ max: 20 }),
  validate(preferencesSchema),
  ctrl.updatePreferences,
);
