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
 * Entitlement, and the ways to get it.
 *
 * The server is the authority — always. A purchase here does not grant
 * anything; it tells the store, the store tells RevenueCat, RevenueCat tells our
 * webhook, and only then does `entitled` change. So every path that might have
 * bought something ends by re-reading the server rather than believing itself.
 *
 * With no RevenueCat key configured (which is the state until there is a store
 * listing) `canPurchase` is false and the paywall shows the trial alone. That
 * is a supported mode, not a degraded one.
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

  const startTrial = useCallback(async () => {
    setBusy(true);
    try {
      const { subscription: fresh } = await client.startTrial();
      setSubscription(fresh);
      return fresh;
    } finally {
      setBusy(false);
    }
  }, [client]);

  const purchase = useCallback(
    async (pkg) => {
      setBusy(true);
      try {
        const result = await purchasePackage(pkg);

        // Cancelling is the most common outcome of showing a paywall, not a
        // failure to report.
        if (result.cancelled) return { cancelled: true };
        if (!result.purchased) return { failed: true, error: result.error };

        // The webhook may not have landed yet; the server stays the authority
        // either way, and the next refresh picks it up.
        await refresh();
        return { purchased: true };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
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
    startTrial,
    purchase,
    restore,
    refresh,
  };
}
