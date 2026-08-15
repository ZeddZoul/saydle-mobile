import { Platform } from "react-native";
import { REVENUECAT_KEY, ENTITLEMENT_ID } from "./config.js";

/**
 * The in-app-purchase boundary.
 *
 * RevenueCat is a native module, so it does not exist in Expo Go — and the API
 * keys do not exist until there is an App Store Connect / Play Console listing.
 * Both are normal states, not errors, and every function here reports
 * `{ available: false }` rather than throwing when either is missing. That is
 * what lets the paywall keep working (on the trial path) months before there is
 * anything to actually buy.
 *
 * The module is required lazily for the same reason: a top-level import of a
 * missing native module takes down every screen that touches this file.
 *
 * Nothing here is trusted for entitlement. A successful purchase only tells the
 * app to go and ask the server again — the server learns the truth from the
 * RevenueCat webhook, behind a receipt Apple or Google actually checked.
 */

let cached;

function load() {
  if (cached !== undefined) return cached;

  try {
    const module = require("react-native-purchases");
    cached = module?.default ?? module ?? null;
  } catch {
    // Expo Go, or the package genuinely absent. Either way: no purchases.
    cached = null;
  }

  return cached;
}

/** True only when there is both a native module and a key to use it with. */
export function purchasesAvailable() {
  return Boolean(load() && REVENUECAT_KEY);
}

/**
 * Identifies the account to RevenueCat so its webhooks name a user we know.
 *
 * `appUserId` is our own user id on purpose: RevenueCat's anonymous ids change
 * on reinstall, and an entitlement that can't be matched back to an account is
 * an entitlement someone paid for and lost.
 */
export async function configurePurchases(appUserId) {
  const Purchases = load();
  if (!Purchases || !REVENUECAT_KEY) return { available: false };

  try {
    await Purchases.configure({ apiKey: REVENUECAT_KEY, appUserID: appUserId });
    return { available: true };
  } catch (error) {
    return { available: false, error };
  }
}

/** The products to show on the paywall, or nothing if there are none to show. */
export async function getOffering() {
  const Purchases = load();
  if (!Purchases || !REVENUECAT_KEY) return { available: false, packages: [] };

  try {
    const offerings = await Purchases.getOfferings();
    return { available: true, packages: offerings?.current?.availablePackages ?? [] };
  } catch (error) {
    return { available: false, packages: [], error };
  }
}

/**
 * Buys a package.
 *
 * A user cancelling is not a failure — it is the single most common outcome of
 * showing a paywall, and reporting it as an error would put an alert in front of
 * someone who just said no.
 */
export async function purchasePackage(pkg) {
  const Purchases = load();
  if (!Purchases || !REVENUECAT_KEY) return { available: false };

  try {
    const result = await Purchases.purchasePackage(pkg);
    return {
      available: true,
      purchased: true,
      entitled: Boolean(result?.customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]),
    };
  } catch (error) {
    if (error?.userCancelled) return { available: true, purchased: false, cancelled: true };
    return { available: true, purchased: false, error };
  }
}

/**
 * Restores purchases.
 *
 * Apple requires this to exist wherever a subscription is sold, and it is the
 * only way someone who reinstalled gets back what they already paid for.
 */
export async function restorePurchases() {
  const Purchases = load();
  if (!Purchases || !REVENUECAT_KEY) return { available: false };

  try {
    const info = await Purchases.restorePurchases();
    return {
      available: true,
      entitled: Boolean(info?.entitlements?.active?.[ENTITLEMENT_ID]),
    };
  } catch (error) {
    return { available: true, entitled: false, error };
  }
}

/** Which store the device would buy from — used only for copy and logging. */
export const store = Platform.select({
  ios: "app_store",
  android: "play_store",
  default: null,
});
