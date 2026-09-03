import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { perUserLimiter } from "../middleware/rateLimit.js";
import { idParamSchema } from "../validators/affirmation.schema.js";
import * as library from "../controllers/library.controller.js";

/**
 * The scrollable library. Premium — enforced in the controller, once, so the
 * decision lives in config/library.js rather than across five handlers.
 */
export const libraryRouter = Router();

libraryRouter.use(requireAuth);

const cursorSchema = z
  .object({
    // Never negative: the cursor only ever moves forward, and a negative one
    // would silently re-show lines they have already read.
    cursor: z.coerce.number().int().min(0),
  })
  .strict();

// Declared before "/:id" so "saved" is never read as an affirmation id.
libraryRouter.get("/saved", library.listSaved);

libraryRouter.get("/", library.list);
libraryRouter.post("/seen", validate(cursorSchema), library.seen);
// Five a quarter-hour: onboarding calls it once. Anything more is a loop.
libraryRouter.post("/warm", perUserLimiter({ max: 5 }), library.warm);

libraryRouter.put("/:id/save", validate(idParamSchema, "params"), library.save);
libraryRouter.delete("/:id/save", validate(idParamSchema, "params"), library.unsave);
