/**
 * Where the legal documents live, and who to write to.
 *
 * App Review requires a working Privacy Policy and Terms of Use link wherever a
 * subscription is sold, and a way to reach support. All three are `EXPO_PUBLIC_*`
 * so a staging build can point at a staging site, with the production defaults
 * baked in so a build with nothing set still links somewhere real. None of
 * these is a secret — they are public URLs by definition.
 */
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || "https://saydle.app/privacy";

export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || "https://saydle.app/terms";

export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@saydle.app";

/** A `mailto:` for the support address, pre-filled with a subject line. */
export const supportMailto = (subject = "Saydle support") =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
