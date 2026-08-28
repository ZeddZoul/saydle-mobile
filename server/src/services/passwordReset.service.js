import crypto from "node:crypto";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { logger } from "../lib/logger.js";

const CODE_TTL_MS = 15 * 60 * 1000;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/**
 * Six digits, uniformly distributed. `randomInt` is the cryptographic generator —
 * `Math.random()` would be predictable enough to matter here.
 */
export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issues a reset code for a user, invalidating any earlier one.
 *
 * Superseding matters: without it, every request a user makes leaves another
 * live code lying in their inbox, which widens the guessing window for no
 * benefit.
 *
 * @returns {Promise<string>} the raw code — the only time it exists in plaintext
 */
export async function issueResetCode(userId) {
  await PasswordResetToken.updateMany(
    { user: userId, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const code = generateCode();

  await PasswordResetToken.create({
    user: userId,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return code;
}

/**
 * Checks a code for a user and consumes it on success.
 *
 * A wrong guess is recorded before anything else, so brute force burns the code
 * rather than the clock. Returns a boolean rather than throwing a descriptive
 * error, because the caller must not tell the client *why* a reset failed.
 */
export async function consumeResetCode(userId, code) {
  const token = await PasswordResetToken.findOne({
    user: userId,
    codeHash: sha256(code),
    usedAt: null,
  });

  if (!token) {
    // No matching code. Count the miss against the newest live code so repeated
    // guessing still exhausts its attempts.
    await PasswordResetToken.findOneAndUpdate(
      { user: userId, usedAt: null },
      { $inc: { attempts: 1 } },
      { sort: { createdAt: -1 } },
    );
    return false;
  }

  if (!token.isUsable()) {
    logger.info({ userId }, "reset code rejected: expired or exhausted");
    return false;
  }

  token.usedAt = new Date();
  await token.save();
  return true;
}
