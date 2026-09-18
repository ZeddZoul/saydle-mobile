import { Platform } from "react-native";

/**
 * Where the API lives.
 *
 * Set EXPO_PUBLIC_API_URL in `.env` at the repo root. Expo inlines any
 * EXPO_PUBLIC_* var at build time, so it is readable here without extra setup —
 * and, for the same reason, it must never hold a secret.
 *
 * On a physical device `localhost` is the phone, not your Mac, so the default
 * below only helps the iOS simulator and web. Use your machine's LAN address
 * (e.g. http://192.168.1.20:4000) when testing on hardware.
 */
const FALLBACK = Platform.select({
  // The Android emulator reaches the host machine on this address.
  android: "http://10.0.2.2:4000",
  default: "http://localhost:4000",
});

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? FALLBACK;

export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * How long someone has to change their mind about deleting their account.
 *
 * Display only — the server's DELETION_GRACE_DAYS is the one that decides. This
 * exists so the confirmation copy can say "30 days" without a round trip.
 */
export const DELETION_GRACE_DAYS = 30;

/** How many days of feed to pull down and keep for offline reading. */
export const OFFLINE_FEED_DAYS = 30;

/**
 * RevenueCat.
 *
 * Publishable keys, safe to inline — they identify the app to RevenueCat and
 * grant nothing on their own. The secret half lives on the server as
 * REVENUECAT_WEBHOOK_SECRET, which is what actually confers entitlement.
 *
 * Unset is a supported state: `lib/purchases.js` reports purchases as
 * unavailable and the paywall degrades to offering nothing, which is exactly
 * what local development and every test run want.
 */
export const REVENUECAT_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

/** Must match REVENUECAT_ENTITLEMENT_ID on the server. */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "premium";

/**
 * The public site. Not derived from API_URL on purpose.
 *
 * These links sit under a subscription CTA, which is where App Review looks
 * (guideline 3.1.2), and the URLs a reviewer compares them against are the ones
 * in the App Store and Play listings: saydle.com/privacy and saydle.com/terms.
 * Pointing the app at api.saydle.com/legal/* instead showed a reviewer a
 * different domain from the one the listing declared, which reads as two
 * different policies even when the words are identical.
 *
 * The API still serves its own copies at /legal/*, and server/tests/legal.test.js
 * still covers them: they are the fallback if the marketing site is ever down,
 * and they cost nothing to keep.
 */
export const SITE_URL = "https://saydle.com";
export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;
