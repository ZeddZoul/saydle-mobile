import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";
import {
  configurePurchases,
  getOffering,
  purchasePackage,
  purchasesAvailable,
  restorePurchases,
} from "../lib/purchases.js";

/**
 * How long to keep asking after a purchase.
 *
 * FAST blocks the button (~9s, the common case). SLOW runs unawaited for
 * another ~55s because a real Test Store webhook was measured arriving 80
 * seconds after the sale. Both are bounded: entitlement is server-truth, so a
 * webhook that never comes is still corrected on the next foreground, whereas
 * polling forever would turn an outage into a request loop from every install.
 */
const FAST_SETTLE = [0, 800, 1500, 2500, 4000];
const SLOW_SETTLE = [6000, 9000, 12000, 12000, 16000];

/** The fields a purchase moves. Compared before and after, never read alone. */
const signature = (s) => `${s?.status}|${s?.expiresAt ?? ""}|${s?.verified}`;

/**
 * Entitlement, and the ways to get it.
 *
 * The server is the authority — always. A purchase here does not grant
 * anything; it tells the store, the store tells RevenueCat, RevenueCat tells our
 * webhook, and only then does `entitled` change. So every path that might have
 * bought something ends by re-reading the server rather than believing itself.
 *
 * With no RevenueCat key configured (which is the state until there is a store
 * listing) `canPurchase` is false and there is nothing to buy. That is a
 * supported mode, not a degraded one — the app still works, on the curated
 * bank, which is exactly what a free reader gets anyway.
 */
export function useSubscription() {
  const { user, client } = useAuth();
  const userId = user?.id;

  const [subscription, setSubscription] = useState(null);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const canPurchase = purchasesAvailable();

  const refresh = useCallback(async () => {
    if (!userId) return null;

    try {
      const { subscription: fresh } = await client.subscription();
      setSubscription(fresh);
      return fresh;
    } catch (err) {
      // Offline: entitlement is whatever we last heard. Locking someone out of
      // what they paid for because a train went into a tunnel would be worse
      // than trusting a stale yes.
      if (!(err instanceof NetworkError)) throw err;
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      // RevenueCat is told our own user id, so its webhooks name an account we
      // can find. Anonymous ids change on reinstall.
      await configurePurchases(userId);
      if (cancelled) return;

      const offering = await getOffering();
      if (!cancelled) setPackages(offering.packages);

      await refresh();
    })().catch(() => setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  /**
   * Re-reads entitlement whenever the app comes back to the foreground.
   *
   * This is the path that actually matters: a purchase goes through a system
   * sheet, so the app is backgrounded at the moment the store confirms it and
   * RevenueCat's webhook reaches us. Fetching only on mount leaves someone who
   * just paid looking at the paywall until they force-quit.
   */
  useEffect(() => {
    if (!userId) return;

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh().catch(() => {});
    });

    return () => subscription.remove();
  }, [userId, refresh]);

  /**
   * Re-reads the server until the purchase shows up there, then stops.
   *
   * A sale is confirmed by the store, relayed to RevenueCat, and only then
   * posted to our webhook — so the read taken the instant `purchasePackage`
   * resolves is genuinely too early. One attempt was all there was: the
   * AppState listener only fires if the app was backgrounded, which a StoreKit
   * sheet does and an in-app purchase modal does not. The screen sat on "Free"
   * until someone thought to tap Restore.
   *
   * It waits for the subscription to *change*, not for any particular flag to
   * be true. Two earlier attempts got this wrong in the same way: `entitled` is
   * already true for someone buying mid-trial, and `verified` is already true
   * for anyone whose account has ever seen a webhook — `verifiedAt` is stamped
   * on every event including EXPIRATION. Both returned on the first read and
   * waited for nothing. A signature over the fields a purchase moves has no
   * such prior state to be confused by.
   *
   * Measured against a real Test Store purchase, the webhook took **80
   * seconds** to arrive, so the window has to be far wider than felt
   * reasonable a priori — hence a fast blocking phase and a long quiet one.
   */
  const settle = useCallback(
    async (before, delays) => {
      for (const wait of delays) {
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        const fresh = await refresh();
        if (signature(fresh) !== signature(before)) return fresh;
      }

      return null;
    },
    [refresh],
  );

  const purchase = useCallback(
    async (pkg) => {
      setBusy(true);
      try {
        const result = await purchasePackage(pkg);

        // Cancelling is the most common outcome of showing a paywall, not a
        // failure to report.
        if (result.cancelled) return { cancelled: true };
        if (!result.purchased) return { failed: true, error: result.error };

        // Two phases. The first blocks — `busy` stays set, buttons stay
        // disabled — and covers the common case in about nine seconds. If the
        // webhook is slower than that, we stop making the reader wait, tell
        // them their payment landed, and keep asking quietly for another
        // minute. The screen repaints itself the moment it arrives, which is
        // the whole point: nobody should have to discover Restore.
        const before = subscription;
        const fresh = await settle(before, FAST_SETTLE);
        if (fresh) return { purchased: true, settled: true };

        // Deliberately not awaited.
        settle(before, SLOW_SETTLE).catch(() => {});
        return { purchased: true, settled: false };
      } finally {
        setBusy(false);
      }
    },
    // `subscription` matters: it is the before-state the signature compares
    // against, and reading a stale one would make every poll look like a change.
    [settle, subscription],
  );

  const restore = useCallback(async () => {
    setBusy(true);
    try {
      const result = await restorePurchases();
      await refresh();
      return result;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return {
    subscription,
    entitled: Boolean(subscription?.entitled),
    packages,
    canPurchase,
    loading,
    busy,
    purchase,
    restore,
    refresh,
  };
}
