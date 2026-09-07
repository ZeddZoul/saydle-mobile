import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { ApiError, NetworkError } from "../lib/errors.js";

const CACHE_KEY = "saved";

/**
 * Bookmarks — deliberately not favourites.
 *
 * A heart is a reaction to a line that just landed. A bookmark is an intention
 * to come back to one. People use both, on different lines, and collapsing them
 * into a single control loses which of the two they meant.
 *
 * Cache-first like every other read in the app: the shelf paints from the last
 * known list immediately and confirms with the server behind it. Writes are
 * optimistic — the icon fills and the row moves at once, rolling back only if
 * the server actually refuses.
 *
 * `locked` is how the shelf learns bookmarking is premium: the server answers
 * 403 rather than the client deciding, so the gate lives in exactly one place
 * (`gate()` in library.controller.js) and the app cannot drift from it.
 */
export function useSaved() {
  const { user, client, cache, syncToken } = useAuth();
  const userId = user?.id;

  const [ids, setIds] = useState(() => new Set());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;

    const cached = await cache.loadJson?.(userId, CACHE_KEY);
    if (cached) {
      setItems(cached);
      setIds(new Set(cached.map((s) => s.affirmation.id)));
      setLoading(false);
    }

    try {
      const { saved } = await client.saved();
      setItems(saved);
      setIds(new Set(saved.map((s) => s.affirmation.id)));
      setOffline(false);
      setLocked(false);
      await cache.saveJson?.(userId, CACHE_KEY, saved);
    } catch (err) {
      if (err instanceof NetworkError) setOffline(true);
      // The shelf is premium. Not an error — a fact the screen states plainly.
      else if (err instanceof ApiError && err.status === 403) setLocked(true);
    } finally {
      setLoading(false);
    }
  }, [userId, client, cache]);

  useEffect(() => {
    load().catch(() => {});
  }, [load, syncToken]);

  const isSaved = useCallback((id) => ids.has(id), [ids]);

  const toggle = useCallback(
    async (affirmation) => {
      const id = affirmation.id;
      const was = ids.has(id);

      // Both views move at once: the feed's icon (ids) and the shelf's row
      // (items). Updating only the set left the shelf showing a bookmark the
      // reader had just removed.
      const previousItems = items;
      const optimistic = was
        ? items.filter((s) => s.affirmation.id !== id)
        : [{ savedAt: new Date().toISOString(), affirmation }, ...items];

      setItems(optimistic);
      setIds((current) => {
        const next = new Set(current);
        if (was) next.delete(id);
        else next.add(id);
        return next;
      });
      if (userId) await cache.saveJson?.(userId, CACHE_KEY, optimistic);

      try {
        if (was) await client.removeSaved(id);
        else await client.addSaved(id);
        load().catch(() => {});
      } catch (err) {
        // A network failure keeps the optimistic state — the same rule the rest
        // of the app follows. Only a real refusal rolls it back.
        if (err instanceof NetworkError) {
          setOffline(true);
          return;
        }

        setItems(previousItems);
        setIds((current) => {
          const next = new Set(current);
          if (was) next.add(id);
          else next.delete(id);
          return next;
        });
        if (userId) await cache.saveJson?.(userId, CACHE_KEY, previousItems);
        throw err;
      }
    },
    [ids, items, client, cache, userId, load],
  );

  return { items, loading, offline, locked, isSaved, toggle, refresh: load };
}
