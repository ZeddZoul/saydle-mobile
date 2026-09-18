import { Platform } from "react-native";
import { REVENUECAT_KEY, ENTITLEMENT_ID } from "./config.js";

/**
 * The in-app-purchase boundary.
 *
 * RevenueCat is a native module, so it does not exist in Expo Go — and the API
 * keys do not exist until there is an App Store Connect / Play Console listing.
 * Both are normal states, not errors, and every function here reports
 * `{ available: false }` rather than throwing when either is missing. That is
 * what lets the app keep running months before there is anything to actually
 * buy: the paywall simply has nothing to offer rather than crashing.
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
 * `{ available: false }` as having no key at all — an inert paywall instead of a
 * dead app.
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
 * Whether `configure()` has run in this process.
 *
 * The SDK may only be configured once. A second call with a different
 * appUserID does not switch user — it logs a warning and keeps the first — so
 * anything that needs to change who the customer is has to go through
 * `identifyUser` instead.
 */
let configured = false;

/**
 * Configures the SDK, once, without claiming to know who the user is.
 *
 * The paywall has to price itself *before* anyone has an account: onboarding
 * asks for an email and password at the very end, and the offering has to be on
 * screen before that. So this configures anonymously, purely so
 * `getOfferings()` has a configured SDK to answer from.
 *
 * Skipping this was a deadlock, and it shipped: the paywall fetched offerings
 * before anything configured the SDK, `getOfferings()` threw, the catch turned
 * it into `packages: []`, and the render guard hid every purchase button. The
 * only thing that configured the SDK was the purchase handler behind those
 * buttons. A new user could never subscribe, and nothing logged an error.
 */
export async function ensureConfigured() {
  const Purchases = load();
  const apiKey = usableKey();
  if (!Purchases || !apiKey) return { available: false };
  if (configured) return { available: true };

  try {
    // No appUserID: RevenueCat mints an anonymous one, which `identifyUser`
    // later aliases onto the real account so the purchase is not stranded.
    await Purchases.configure({ apiKey });
    configured = true;
    return { available: true };
  } catch (error) {
    return { available: false, error };
  }
}

/**
 * Attaches the RevenueCat customer to our account.
 *
 * `appUserId` is our own user id on purpose: RevenueCat's anonymous ids change
 * on reinstall, and an entitlement that can't be matched back to an account is
 * an entitlement someone paid for and lost. It is also what the webhook reads
 * as `app_user_id` — an event carrying an anonymous id hits the "subscription
 * event for unknown user" branch and the purchase grants nothing.
 *
 * `logIn` rather than a second `configure`: it aliases the anonymous customer
 * onto the real one, carrying any purchase made before we knew who they were.
 */
export async function identifyUser(appUserId) {
  const Purchases = load();
  if (!Purchases || !usableKey()) return { available: false };
  if (!appUserId) return { available: false, reason: "no user id" };

  const ready = await ensureConfigured();
  if (!ready.available) return ready;

  try {
    await Purchases.logIn(appUserId);
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

/** Which store the device would buy from — used only for copy and logging. */
export const store = Platform.select({
  ios: "app_store",
  android: "play_store",
  default: null,
});
