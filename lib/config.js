import { Platform } from "react-native";

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
