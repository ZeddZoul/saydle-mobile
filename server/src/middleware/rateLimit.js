// Aliased: the package exports `rateLimit` as both default and named.
import rateLimiter from "express-rate-limit";
import { isTest } from "../config/env.js";

const passthrough = (_req, _res, next) => next();

/**
 * A limit per signed-in account, for the routes that spend money.
 *
 * The auth routes limit by IP, which is right for an endpoint anyone can hit.
 * These sit behind `requireAuth`, and what they protect is the bill: a voice
 * session renders through ElevenLabs, a warm and a preference change each
 * schedule a model batch. One account behind a NAT should not be able to run
 * those on a loop, and one NAT's worth of readers should not share a bucket.
 *
 * Off under test, like the auth limiters, so a suite that registers fifty
 * users is not throttled by its own thoroughness. `enabled` is exposed so the
 * limiter itself can be tested in isolation.
 */
export function perUserLimiter({ max, windowMs = 15 * 60 * 1000, enabled = !isTest }) {
  if (!enabled) return passthrough;

  return rateLimiter({
    windowMs,
    max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // The routes are authenticated, so there is always a user. The fallback
    // exists only so a misplaced limiter cannot throw.
    keyGenerator: (req) => String(req.user?._id ?? req.user?.id ?? "anonymous"),
    message: {
      error: {
        code: "too_many_requests",
        message: "Too many requests. Try again in a little while.",
      },
    },
  });
}
