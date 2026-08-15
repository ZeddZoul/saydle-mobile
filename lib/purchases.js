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
let cachedUI;

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

/**
 * The same boundary for RevenueCat's UI package, which Customer Center needs.
 *
 * Loaded separately from `react-native-purchases` because it is a separate
 * native module with its own install state — and because `presentCustomerCenter`
 * calls `throwIfNativeModulesNotAvailable()` internally, so a bare call in Expo
 * Go throws rather than no-ops.
 */
function loadUI() {
  if (cachedUI !== undefined) return cachedUI;

  try {
    const module = require("react-native-purchases-ui");
    cachedUI = module?.default ?? module ?? null;
  } catch {
    cachedUI = null;
  }

  return cachedUI;
}

/**
 * The key, or nothing if this build must not use it.
 *
 * A `test_` key is RevenueCat's Test Store — real-looking purchases with no App
 * Store Connect or Play Console behind them. The SDK refuses one in a release
 * build on purpose: it shows an alert and *crashes the app*, so that test
 * entitlements can never leak into production.
 *
 * `EXPO_PUBLIC_*` vars are inlined at build time, which is what makes that a
 * live hazard rather than a footnote: a production build cut on a machine whose
 * .env still holds the test key ships that crash to the store, and it fires on
 * launch for everyone. Refusing here turns it into the same quiet
 * `{ available: false }` as having no key at all — the paywall falls back to the
 * trial instead of taking the app down.
 */
function usableKey() {
  if (!REVENUECAT_KEY) return null;
  if (REVENUECAT_KEY.startsWith("test_") && !__DEV__) return null;
  return REVENUECAT_KEY;
}

/** True only when there is both a native module and a key this build may use. */
export function purchasesAvailable() {
  return Boolean(load() && usableKey());
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
  const apiKey = usableKey();
  if (!Purchases || !apiKey) return { available: false };

  try {
    await Purchases.configure({ apiKey, appUserID: appUserId });
    return { available: true };
  } catch (error) {
    return { available: false, error };
  }
}

/** The products to show on the paywall, or nothing if there are none to show. */
export async function getOffering() {
  const Purchases = load();
  if (!Purchases || !usableKey()) return { available: false, packages: [] };

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
  if (!Purchases || !usableKey()) return { available: false };

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
  if (!Purchases || !usableKey()) return { available: false };

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

/**
 * Opens RevenueCat's Customer Center.
 *
 * A subscriber needs somewhere to cancel, change plan, or ask for a refund, and
 * a deep link into iOS Settings is a poor version of that — it leaves the app,
 * and on Android it lands somewhere different again. Customer Center is one
 * screen, configured from the RevenueCat dashboard, that handles all three.
 *
 * It resolves when the sheet is dismissed, not when the user finishes anything:
 * a cancellation or refund reaches us through the webhook, so the caller must
 * re-ask the server afterwards rather than assuming what changed. Nothing here
 * may be treated as entitlement — same rule as the rest of this file.
 */
export function customerCenterAvailable() {
  // Its own check, not purchasesAvailable(): the UI package is a separate native
  // module, so it can be absent on a build where purchases work perfectly well.
  return Boolean(loadUI() && load() && usableKey());
}

export async function presentCustomerCenter() {
  const UI = loadUI();
  // The SDK must be configured before the sheet has a customer to show, and
  // `usableKey()` is the same gate that decided whether configure() ever ran.
  if (!UI || !load() || !usableKey()) return { available: false };

  try {
    await UI.presentCustomerCenter();
    return { available: true, dismissed: true };
  } catch (error) {
    return { available: true, dismissed: false, error };
  }
}

/** Which store the device would buy from — used only for copy and logging. */
export const store = Platform.select({
  ios: "app_store",
  android: "play_store",
  default: null,
});
