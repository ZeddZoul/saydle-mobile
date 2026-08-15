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
 * Display only — it is what the confirmation screen promises *before* the
 * request is made. The server sets the real date and returns it, and that date
 * is what everything afterwards renders. Keep the two in step (see
 * server/src/config/deletion.js); a mismatch here misleads rather than breaks.
 */
export const DELETION_GRACE_DAYS = 30;

/**
 * Length of the free trial, mirrored from the server's TRIAL_DAYS.
 *
 * Used only to draw the dates on the trial timeline before a trial exists —
 * once one is running, the server's trialEndsAt is the authority and this is
 * not consulted. Keep in step with server/src/config/subscription.js.
 */
export const TRIAL_DAYS = 3;

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
 * unavailable and the paywall falls back to the free trial, which is exactly
 * what local development and every test run want.
 */
export const REVENUECAT_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

/** Must match REVENUECAT_ENTITLEMENT_ID on the server. */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "premium";
