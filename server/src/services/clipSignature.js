import crypto from "node:crypto";
import { clipSigningKey } from "../config/env.js";

/**
 * Signed URLs for private clips.
 *
 * The audio player fetches a clip directly and cannot send a bearer header,
 * so a clip that belongs to one person has to carry its own proof of access
 * in the URL. That proof is an HMAC over the clip id and an expiry, minted
 * when the session is handed out and checked when the clip is fetched.
 *
 * Short-lived on purpose: a URL that leaks — a screenshot, a proxy log — is
 * good for an hour and then for nothing. Shared clips are not signed at all;
 * there is nothing private about a curated line.
 */

/** How long a session's URLs stay playable. Longer than any session, shorter than a day. */
export const CLIP_URL_TTL_SECONDS = 60 * 60;

function digest(id, exp) {
  return crypto.createHmac("sha256", clipSigningKey).update(`${id}.${exp}`).digest("base64url");
}

/** Mints `{ sig, exp }` for a clip id. `exp` is unix seconds. */
export function signClip(id, { now = Date.now(), ttlSeconds = CLIP_URL_TTL_SECONDS } = {}) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return { sig: digest(String(id), exp), exp };
}

/** The path the app should fetch a private clip from. */
export function signedClipPath(id, options) {
  const { sig, exp } = signClip(id, options);
  return `/api/voice/clip/${id}?sig=${sig}&exp=${exp}`;
}

/**
 * True only for a signature that matches and has not expired.
 *
 * Constant-time on the digest, and length-guarded because timingSafeEqual
 * throws on a mismatch, which would itself be a signal.
 */
export function verifyClipSignature(id, sig, exp, { now = Date.now() } = {}) {
  const expiry = Number(exp);
  if (!Number.isInteger(expiry) || expiry <= 0) return false;
  if (expiry * 1000 < now) return false;
  if (typeof sig !== "string" || sig.length === 0) return false;

  const expected = digest(String(id), expiry);
  if (sig.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
