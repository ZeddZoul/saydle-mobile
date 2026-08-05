import { verifyAccessToken } from "../services/token.service.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

/**
 * Requires a valid `Authorization: Bearer <accessToken>` header and attaches the
 * live user document as `req.user`.
 *
 * The user is re-read on every request rather than trusted from the token body,
 * so a deleted account stops working immediately instead of at token expiry.
 */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw AppError.unauthorized("Missing bearer token.");
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      throw AppError.unauthorized("Account no longer exists.");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
