import { Router } from "express";
// Aliased: the package exports `rateLimit` as both default and named.
import rateLimiter from "express-rate-limit";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { isTest } from "../config/env.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  deleteAccountSchema,
} from "../validators/auth.schema.js";
import * as auth from "../controllers/auth.controller.js";

const passthrough = (_req, _res, next) => next();

const limiter = (max) =>
  isTest
    ? passthrough
    : rateLimiter({
        windowMs: 15 * 60 * 1000,
        max,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: {
          error: {
            code: "too_many_requests",
            message: "Too many attempts. Try again later.",
          },
        },
      });

export const authRouter = Router();

authRouter.post("/register", limiter(10), validate(registerSchema), auth.register);
authRouter.post("/login", limiter(20), validate(loginSchema), auth.login);
authRouter.post("/refresh", limiter(60), validate(refreshSchema), auth.refresh);
authRouter.post("/logout", validate(logoutSchema), auth.logout);

// Tighter limits than login: these endpoints send mail and guess codes.
authRouter.post(
  "/forgot-password",
  limiter(5),
  validate(forgotPasswordSchema),
  auth.forgotPassword,
);
authRouter.post(
  "/reset-password",
  limiter(10),
  validate(resetPasswordSchema),
  auth.resetPassword,
);

// Signed-in, so no enumeration risk — but still limited: one sends mail, the
// other guesses codes.
authRouter.post("/verify-email/send", requireAuth, limiter(5), auth.sendEmailVerification);
authRouter.post(
  "/verify-email",
  requireAuth,
  limiter(10),
  validate(verifyEmailSchema),
  auth.verifyEmail,
);

authRouter.get("/me", requireAuth, auth.me);
// Five attempts per window. The endpoint takes a password, so without this a
// live session becomes a quiet way to test guesses against the account it
// belongs to — and unlike login, nobody is watching this one.
authRouter.delete("/me", requireAuth, limiter(5), validate(deleteAccountSchema), auth.deleteMe);
// Cancelling has to be reachable by anyone mid-countdown, which is why sign-in
// keeps working for a pending account.
authRouter.post("/me/restore", requireAuth, auth.restoreMe);
