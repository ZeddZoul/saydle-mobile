import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";
import { useSubscription } from "./useSubscription.js";

/**
 * The reader's own affirmations — a premium feature.
 *
 * Writes are not queued offline, unlike favourites and profile answers. A custom
 * affirmation is checked by the server before it is accepted (see
 * controllers/custom.controller.js), so queuing one would mean showing someone
 * their own sentence as saved and taking it away days later when the queue
 * finally drained and the server said no.
 */
export function useCustomAffirmations() {
  const { user, client } = useAuth();
  const {
    entitled,
    loading: checkingEntitlement,
    refresh: refreshSubscription,
  } = useSubscription();
  const userId = user?.id;

  const [affirmations, setAffirmations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;

    try {
      const { affirmations: list } = await client.customAffirmations();
      setAffirmations(list);
      setOffline(false);
    } catch (err) {
      if (err instanceof NetworkError) setOffline(true);
      else throw err;
    } finally {
      setLoading(false);
    }
  }, [userId, client]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const create = useCallback(
    async (text) => {
      setSaving(true);
      try {
        const { affirmation } = await client.createCustomAffirmation(text);
        setAffirmations((current) => [affirmation, ...current]);
        return affirmation;
      } finally {
        setSaving(false);
      }
    },
    [client],
  );

  const remove = useCallback(
    async (id) => {
      const previous = affirmations;
      setAffirmations((current) => current.filter((a) => a.id !== id));

      try {
        await client.deleteCustomAffirmation(id);
      } catch (err) {
        // Put it back rather than leaving the list claiming something untrue.
        setAffirmations(previous);
        throw err;
      }
    },
    [client, affirmations],
  );

  return {
    affirmations,
    entitled,
    loading: loading || checkingEntitlement,
    offline,
    saving,
    create,
    remove,
    reload: load,
    /** Entitlement first, then the list — the list is pointless without it. */
    refresh: useCallback(async () => {
      await refreshSubscription();
      await load();
    }, [refreshSubscription, load]),
  };
}
