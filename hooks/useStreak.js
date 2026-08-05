import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";

/**
 * The streak, cache-first like the feed.
 *
 * The server derives it from which days were actually read, so there's no local
 * counter to drift. Offline we show the last known streak rather than an error —
 * the number is encouragement, not something worth interrupting the screen for.
 */
export function useStreak() {
  const { user, client, cache } = useAuth();
  const userId = user?.id;

  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;

    const cached = await cache.loadStreak(userId);
    if (cached) {
      setStreak(cached);
      setLoading(false);
    }

    try {
      const payload = await client.streak();
      setStreak(payload);
      setOffline(false);
      await cache.saveStreak(userId, payload);
    } catch (err) {
      if (err instanceof NetworkError) setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [userId, client, cache]);

  useEffect(() => {
    load();
  }, [load]);

  return { streak, loading, offline, refresh: load };
}
