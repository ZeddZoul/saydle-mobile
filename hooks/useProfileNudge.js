import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";
import { ops } from "../lib/outbox.js";
import { todayLocal } from "../lib/dates.js";
import {
  afterAnswer,
  afterDismiss,
  initialNudgeState,
  nextNudge,
} from "../lib/nudges.js";

/**
 * The progressive-profile nudge: one unanswered question at a time, surfaced on
 * the Today screen, answerable in place.
 *
 * Cache-first like the other data hooks — the completeness meter and the pending
 * question both render offline, and an answer given with no signal goes to the
 * outbox rather than being refused.
 *
 * The cadence itself lives in lib/nudges.js; this hook only persists it.
 */
export function useProfileNudge() {
  const { user, client, cache, outbox, syncToken } = useAuth();
  const userId = user?.id;

  const [completeness, setCompleteness] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((payload) => {
    setCompleteness(payload.completeness ?? null);
    setSuggestions(payload.suggestions ?? []);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const [cached, savedState] = await Promise.all([
        cache.loadProfile(userId),
        cache.loadNudgeState(userId),
      ]);
      if (cancelled) return;

      if (cached) apply(cached);

      // First run on this device starts the grace period, so a brand-new
      // account isn't asked for more the moment it finishes onboarding.
      const seeded = savedState ?? initialNudgeState(todayLocal());
      setState(seeded);
      if (!savedState) await cache.saveNudgeState(userId, seeded);

      try {
        const payload = await client.profile();
        if (cancelled) return;
        apply(payload);
        await cache.saveProfile(userId, payload);
      } catch (err) {
        // Offline is not an error here — the cached copy is enough to nudge from.
        if (!(err instanceof NetworkError)) throw err;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, client, cache, apply, syncToken]);

  const persist = useCallback(
    async (next) => {
      setState(next);
      if (userId) await cache.saveNudgeState(userId, next);
    },
    [cache, userId],
  );

  const suggestion = nextNudge({
    suggestions,
    completeness,
    state,
    today: todayLocal(),
  });

  /**
   * Saves one answer. The PATCH response carries the recomputed completeness and
   * the next suggestions, so the card can hand straight over to the next
   * question without a second round trip — though the cooldown means it won't.
   */
  const answer = useCallback(
    async (key, value) => {
      try {
        const payload = await client.updateProfile({ [key]: value });
        apply(payload);
        if (userId) await cache.saveProfile(userId, payload);
      } catch (err) {
        if (!(err instanceof NetworkError)) throw err;

        // Unreachable: queue the patch and drop the question locally. Someone
        // who answered has answered — making them type it again when they land
        // is the app's problem to solve, not theirs.
        await outbox.add(userId, ops.profile({ [key]: value }));
        setSuggestions((current) => current.filter((s) => s.key !== key));
      }

      await persist(afterAnswer(state ?? initialNudgeState(), todayLocal()));
    },
    [client, apply, cache, userId, persist, state, outbox],
  );

  const dismiss = useCallback(
    () => persist(afterDismiss(state ?? initialNudgeState(), todayLocal())),
    [persist, state],
  );

  return {
    /** Cadence-gated: what the Today screen may interrupt with, usually null. */
    suggestion,
    /**
     * The same question with the cadence ignored — for the Profile screen, where
     * the user came looking. Backing off is about not interrupting; it should
     * never hide something someone deliberately went to find.
     */
    pending: suggestions[0] ?? null,
    completeness,
    loading,
    answer,
    dismiss,
  };
}
