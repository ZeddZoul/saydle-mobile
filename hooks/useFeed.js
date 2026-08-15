import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";
import { OFFLINE_FEED_DAYS } from "../lib/config.js";
import { todayLocal } from "../lib/dates.js";
import { ops } from "../lib/outbox.js";

/**
 * The feed, cache-first.
 *
 * Cached entries render immediately, then the network revalidates in the
 * background. With no network the cache is the answer, not an error state — the
 * whole point of scheduling days ahead on the server.
 */
export function useFeed() {
  const { user, client, cache, outbox, syncToken } = useAuth();
  const userId = user?.id;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!userId) return;

      if (isRefresh) setRefreshing(true);

      const cached = await cache.loadFeed(userId);
      if (cached?.entries?.length) {
        setEntries(cached.entries);
        setLoading(false);
      }

      try {
        const payload = await client.feed(OFFLINE_FEED_DAYS);
        setEntries(payload.entries);
        setOffline(false);
        setError(null);
        await cache.saveFeed(userId, payload);
      } catch (err) {
        if (err instanceof NetworkError) {
          // Expected, not exceptional. Keep showing what we have.
          setOffline(true);
          if (!cached?.entries?.length) setError(err);
        } else {
          setError(err);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, client, cache],
  );

  // Refetch after the outbox replays: a day marked read offline should come
  // back from the server as read, not stay a local guess.
  useEffect(() => {
    load();
  }, [load, syncToken]);

  // Chosen from the device's own clock, so a cached feed rolls over to the next
  // day correctly with the server unreachable.
  const today = todayLocal();
  const todayEntry = entries.find((entry) => entry.date === today) ?? null;

  const markSeen = useCallback(async () => {
    if (!todayEntry || todayEntry.seenAt) return;

    setEntries((current) =>
      current.map((entry) =>
        entry.date === today ? { ...entry, seenAt: new Date().toISOString() } : entry,
      ),
    );

    try {
      await client.markSeen(today);
    } catch (err) {
      // Unreachable: queue it, so the streak still counts a day read on a plane.
      // Anything else is the server's answer about a day it already knows —
      // the next successful load will correct us.
      if (err instanceof NetworkError) await outbox.add(userId, ops.seen(today));
    }
  }, [todayEntry, today, client, outbox, userId]);

  return {
    entries,
    todayEntry,
    today,
    loading,
    refreshing,
    offline,
    error,
    refresh: () => load({ isRefresh: true }),
    markSeen,
  };
}
