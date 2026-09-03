import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * A stable, short, one-way fingerprint of an email address for log lines.
 *
 * Enough to say "the same address again" across a burst of reset requests,
 * and not enough to recover the address — keyed, because plain SHA of an
 * email falls to a wordlist in seconds. Truncated because a log field only
 * needs to correlate, not to verify. Deliberately NOT the tombstone HMAC: a
 * log line should not be a lookup key into the billing trail.
 */
export function emailFingerprint(email) {
  if (!email) return null;
  return crypto
    .createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(String(email).trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}
