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

  /**
   * Re-reads the server until the purchase shows up there, then stops.
   *
   * A sale is confirmed by the store, relayed to RevenueCat, and only then
   * posted to our webhook — so the read taken the instant `purchasePackage`
   * resolves is genuinely too early and returns the state from before the
   * purchase. One attempt was all there was: the AppState listener only fires
   * if the app was backgrounded, which a StoreKit sheet does and an in-app
   * purchase modal does not. The screen sat on "Free" until someone thought to
   * tap Restore, which is not a thing anyone should have to work out.
   *
   * Bounded deliberately. Entitlement is server-truth, so if the webhook is
   * late or lost the next foreground still corrects it — polling until it
   * arrives would turn a webhook outage into an endless request loop from every
   * installed copy of the app.
   */
  const settle = useCallback(async () => {
    const backoff = [0, 800, 1500, 2500, 4000];

    for (const wait of backoff) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      const fresh = await refresh();
      // `verified`, not `entitled`. Someone buying mid-trial is already
      // entitled, so waiting on that returns instantly and never sees the
      // purchase — which is the exact case this whole function exists for.
      // `verifiedAt` is set only by the webhook and is explicitly null for a
      // trial, so it means precisely "a store has confirmed this".
      if (fresh?.verified) return fresh;
    }

    return null;
  }, [refresh]);

  const purchase = useCallback(
    async (pkg) => {
      setBusy(true);
      try {
        const result = await purchasePackage(pkg);

        // Cancelling is the most common outcome of showing a paywall, not a
        // failure to report.
        if (result.cancelled) return { cancelled: true };
        if (!result.purchased) return { failed: true, error: result.error };

        // `busy` stays set for the whole wait, which is what keeps the buttons
        // disabled while we are confirming rather than guessing.
        const fresh = await settle();
        return { purchased: true, settled: Boolean(fresh?.verified) };
      } finally {
        setBusy(false);
      }
    },
    [settle],
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
