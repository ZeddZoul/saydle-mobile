import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";
import { ops } from "../lib/outbox.js";

/**
 * Favorites, cache-first like the feed.
 *
 * Toggling is optimistic and rolls back if the server rejects it. A network
 * failure keeps the optimistic state and queues the write in the outbox, which
 * replays it the next time the app can reach the server.
 */
export function useFavorites() {
  const { user, client, cache, outbox, syncToken } = useAuth();
  const userId = user?.id;

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;

    const cached = await cache.loadFavorites(userId);
    if (cached) {
      setFavorites(cached);
      setLoading(false);
    }

    try {
      const payload = await client.favorites();
      setFavorites(payload.favorites);
      setOffline(false);
      await cache.saveFavorites(userId, payload.favorites);
    } catch (err) {
      if (err instanceof NetworkError) setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [userId, client, cache]);

  // syncToken changes when the outbox replays a queued write, so the list stops
  // showing purely optimistic state once the server has actually agreed.
  useEffect(() => {
    load();
  }, [load, syncToken]);

  const isFavorite = useCallback(
    (affirmationId) =>
      favorites.some((f) => f.affirmation?.id === affirmationId),
    [favorites],
  );

  const toggle = useCallback(
    async (affirmation) => {
      const currentlyFavorite = isFavorite(affirmation.id);
      const previous = favorites;

      const optimistic = currentlyFavorite
        ? favorites.filter((f) => f.affirmation?.id !== affirmation.id)
        : [{ favoritedAt: new Date().toISOString(), affirmation }, ...favorites];

      setFavorites(optimistic);
      if (userId) await cache.saveFavorites(userId, optimistic);

      try {
        if (currentlyFavorite) {
          await client.removeFavorite(affirmation.id);
        } else {
          await client.addFavorite(affirmation.id);
        }
        setOffline(false);
      } catch (err) {
        if (err instanceof NetworkError) {
          setOffline(true);
          // Keep the optimistic state and queue the write. Collapsing by
          // affirmation means a dozen taps offline replay as one.
          await outbox.add(userId, ops.favorite(affirmation.id, !currentlyFavorite));
          return;
        }
        // The server actively refused — undo, so the UI stops claiming
        // something that isn't true.
        setFavorites(previous);
        if (userId) await cache.saveFavorites(userId, previous);
        throw err;
      }
    },
    [favorites, isFavorite, client, cache, userId, outbox],
  );

  return { favorites, loading, offline, isFavorite, toggle, reload: load };
}
