import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";

/**
 * Bookmarks — deliberately not favourites.
 *
 * A heart is a reaction to a line that just landed. A bookmark is an intention
 * to come back to one. People use both, on different lines, and collapsing them
 * into a single control loses which of the two they meant.
 *
 * Optimistic, like every other write in the app: the icon fills immediately and
 * rolls back only if the server actually refuses.
 */
export function useSaved() {
  const { user, client, syncToken } = useAuth();
  const userId = user?.id;

  const [ids, setIds] = useState(() => new Set());
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!userId) return;

    try {
      const { saved } = await client.saved();
      setItems(saved);
      setIds(new Set(saved.map((s) => s.affirmation.id)));
    } catch (err) {
      // Offline, or not premium. Neither is worth interrupting a scroll for.
      if (!(err instanceof NetworkError)) return;
    }
  }, [userId, client]);

  useEffect(() => {
    load().catch(() => {});
  }, [load, syncToken]);

  const isSaved = useCallback((id) => ids.has(id), [ids]);

  const toggle = useCallback(
    async (affirmation) => {
      const id = affirmation.id;
      const was = ids.has(id);

      setIds((current) => {
        const next = new Set(current);
        if (was) next.delete(id);
        else next.add(id);
        return next;
      });

      try {
        if (was) await client.removeSaved(id);
        else await client.addSaved(id);
        load().catch(() => {});
      } catch (err) {
        // A network failure keeps the optimistic state — the same rule the rest
        // of the app follows. Only a real refusal rolls it back.
        if (err instanceof NetworkError) return;

        setIds((current) => {
          const next = new Set(current);
          if (was) next.add(id);
          else next.delete(id);
          return next;
        });
        throw err;
      }
    },
    [ids, client, load],
  );

  return { items, isSaved, toggle, refresh: load };
}
