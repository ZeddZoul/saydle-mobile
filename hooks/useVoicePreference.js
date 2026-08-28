import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { todayLocal } from "../lib/dates.js";
import { DEFAULT_VOICE, suggestedVoice, voiceByKey } from "../lib/voices.js";

const KEY = "voicePreference";

/**
 * Which voice reads today, and which will read tomorrow.
 *
 * Choosing a voice never changes the session already in progress or the one
 * today's audio was rendered for — it takes effect on the next day. That is not
 * a limitation dressed up as a feature: today's seven lines are already
 * rendered and cached per (text, voice), so switching now would throw that away
 * and pay to render them again. Deferring means a voice change can never
 * invalidate a cache.
 *
 * It also makes the choice feel considered rather than a toggle to flip
 * mid-listen, which is the right register for something this personal.
 *
 * The server is the authority, because the server is what pays to render. This
 * hook mirrors it and caches the answer so the picker still shows the right
 * voice offline — but a choice made offline is not applied locally and then
 * reconciled. It is simply refused, with `saving` false and the old voice
 * still showing, because the alternative is a picker that claims a voice the
 * renderer knows nothing about.
 */
export function useVoicePreference() {
  const { user, cache, client } = useAuth();
  const userId = user?.id;
  const today = todayLocal();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // An injected cache — a test's, or one from a build before these helpers
    // existed — may not have them. That is "nothing saved", not "still
    // loading": optional chaining short-circuits the whole chain, so without
    // this branch the hook would sit at loading forever.
    if (!cache.loadJson) {
      setLoading(false);
      return undefined;
    }

    // Cache first, then confirm with the server — the same shape as every other
    // read hook, so the picker paints immediately rather than after a round trip.
    cache
      .loadJson(userId, KEY)
      .then((saved) => {
        if (cancelled) return;
        if (saved) setState(saved);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false))
      .then(() => client?.voicePreference?.(today))
      .then((fresh) => {
        if (cancelled || !fresh) return;

        const next = {
          active: fresh.active,
          pending: fresh.pending ?? "",
          pendingFrom: fresh.pendingFrom ?? "",
        };
        setState(next);
        return cache.saveJson?.(userId, KEY, next);
      })
      // Offline. The cached answer stands, which is the right one until they
      // change it — and changing it needs the server anyway.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // `today` is deliberately not a dependency: it changes at midnight, and
    // refetching the voice under someone mid-session is exactly what the whole
    // next-day rule exists to avoid. The next mount picks up the new day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cache, client]);

  const fallback = suggestedVoice(user?.preferences?.tone) ?? DEFAULT_VOICE;

  // A pending choice becomes the active one once its day arrives. Derived on
  // read rather than migrated on a schedule, because there is no reliable
  // moment to run a migration on a phone that may not be open at midnight.
  const landed = state?.pendingFrom && state.pendingFrom <= today;
  const active = (landed ? state.pending : state?.active) ?? fallback;
  const pending = !landed && state?.pending && state.pending !== active ? state.pending : null;

  const [saving, setSaving] = useState(false);

  const choose = useCallback(
    async (key) => {
      if (!userId || saving) return;
      setSaving(true);

      try {
        // Not optimistic, unlike every other write in the app. The server owns
        // this one because it decides which voice we pay to render in, and a
        // picker showing a voice the renderer never heard about is worse than
        // a tap that visibly did nothing.
        const res = await client.setVoicePreference(key, today);

        const next = {
          active: res.active,
          pending: res.pending ?? "",
          pendingFrom: res.pendingFrom ?? "",
        };
        setState(next);
        await cache.saveJson?.(userId, KEY, next);
      } catch {
        // Offline or refused. The voice they had is the voice they keep.
      } finally {
        setSaving(false);
      }
    },
    [cache, client, saving, today, userId],
  );

  return {
    loading,
    saving,
    /** Reads today's session. */
    active,
    /** Chosen but not yet in effect, or null. */
    pending,
    voice: voiceByKey(active),
    choose,
  };
}
