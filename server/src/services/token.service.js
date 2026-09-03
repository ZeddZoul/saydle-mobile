import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../lib/logger.js";

const REFRESH_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
// A family rotates forever otherwise — every refresh is a fresh 30 days.
const FAMILY_MAX_MS = env.REFRESH_FAMILY_MAX_DAYS * 24 * 60 * 60 * 1000;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id ?? user._id.toString() }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: "saydle",
    audience: "saydle-app",
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      // Pinned. Without it the library accepts any HMAC variant the header
      // names, and "none" has been a real bug in other verifiers.
      algorithms: ["HS256"],
      issuer: "saydle",
      audience: "saydle-app",
    });
  } catch {
    throw AppError.unauthorized("Access token is invalid or expired.");
  }
}

/**
 * Mint a refresh token. Returns the raw token — the only time it exists in
 * plaintext. The caller must hand it to the client and then forget it.
 */
export async function issueRefreshToken(userId, { family, familyIssuedAt } = {}) {
  const raw = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(raw),
    family: family ?? crypto.randomUUID(),
    familyIssuedAt: familyIssuedAt ?? new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return raw;
}

/** When a token's family was first signed in. Older rows predate the field. */
const familyStart = (token) => token.familyIssuedAt ?? token.createdAt ?? new Date();

/**
 * Exchange a refresh token for a fresh pair.
 *
 * Presenting a token that was already rotated means either a replay or a stolen
 * token, and we cannot tell which — so the whole family dies and the user signs
 * in again.
 */
export async function rotateRefreshToken(rawToken) {
  const existing = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });

  if (!existing) {
    throw AppError.unauthorized("Refresh token is invalid.");
  }

  if (existing.rotatedAt !== null) {
    logger.warn(
      { userId: existing.user.toString(), family: existing.family },
      "refresh token replay detected — revoking family",
    );
    await revokeFamily(existing.family);
    throw AppError.unauthorized("Refresh token has already been used.");
  }

  if (!existing.isUsable()) {
    throw AppError.unauthorized("Refresh token is expired or revoked.");
  }

  // The family has a lifetime as well as each token. Past it the chain ends
  // and they sign in again — a session that can renew itself indefinitely is
  // a stolen session that never has to.
  const issuedAt = familyStart(existing);
  if (Date.now() - issuedAt.getTime() > FAMILY_MAX_MS) {
    await revokeFamily(existing.family);
    throw AppError.unauthorized("Session has reached its maximum age. Sign in again.");
  }

  existing.rotatedAt = new Date();
  await existing.save();

  const raw = await issueRefreshToken(existing.user, {
    family: existing.family,
    familyIssuedAt: issuedAt,
  });

  return { userId: existing.user, refreshToken: raw };
}

export async function revokeToken(rawToken) {
  await RefreshToken.updateOne(
    { tokenHash: sha256(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeFamily(family) {
  await RefreshToken.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllForUser(userId) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
