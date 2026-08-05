import crypto from "node:crypto";
import { EmailVerificationToken } from "../models/EmailVerificationToken.js";
import { logger } from "../lib/logger.js";

// Longer than a password reset's 15 minutes: verifying is not urgent, and a code
// that expires while someone walks to their laptop is friction with no payoff.
const CODE_TTL_MS = 24 * 60 * 60 * 1000;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/** Six digits from the cryptographic generator — see passwordReset.service.js. */
export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issues a verification code, superseding any earlier one.
 *
 * Superseding matters here for the same reason as resets: without it, every
 * "resend" leaves another live code in the inbox, widening the guessing window
 * for no benefit.
 *
 * @returns {Promise<string>} the raw code — the only time it exists in plaintext
 */
export async function issueVerificationCode(user) {
  await EmailVerificationToken.updateMany(
    { user: user._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const code = generateCode();

  await EmailVerificationToken.create({
    user: user._id,
    email: user.email,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return code;
}

/**
 * Checks a code and consumes it on success.
 *
 * The code is bound to the address it was sent to: changing the account's email
 * invalidates any code already in flight, so a code mailed to a mistyped address
 * cannot later verify the corrected one.
 *
 * A wrong guess is recorded first, so brute force burns the code rather than
 * the clock.
 */
export async function consumeVerificationCode(user, code) {
  const token = await EmailVerificationToken.findOne({
    user: user._id,
    codeHash: sha256(code),
    usedAt: null,
  });

  if (!token) {
    await EmailVerificationToken.findOneAndUpdate(
      { user: user._id, usedAt: null },
      { $inc: { attempts: 1 } },
      { sort: { createdAt: -1 } },
    );
    return false;
  }

  if (!token.isUsable()) {
    logger.info({ userId: user.id }, "verification code rejected: expired or exhausted");
    return false;
  }

  if (token.email !== user.email) {
    logger.info({ userId: user.id }, "verification code rejected: address changed");
    return false;
  }

  token.usedAt = new Date();
  await token.save();
  return true;
}
