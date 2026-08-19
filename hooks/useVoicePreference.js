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
 * Stored locally for now. It belongs on the server once ElevenLabs renders the
 * audio, because that is where the rendering happens — the shape here (active
 * plus pending plus the date it lands) is what would move.
 */
export function useVoicePreference() {
  const { user, cache } = useAuth();
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

    cache
      .loadJson(userId, KEY)
      .then((saved) => {
        if (cancelled) return;
        setState(saved ?? null);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [userId, cache]);

  const fallback = suggestedVoice(user?.preferences?.tone) ?? DEFAULT_VOICE;

  // A pending choice becomes the active one once its day arrives. Derived on
  // read rather than migrated on a schedule, because there is no reliable
  // moment to run a migration on a phone that may not be open at midnight.
  const landed = state?.pendingFrom && state.pendingFrom <= today;
  const active = (landed ? state.pending : state?.active) ?? fallback;
  const pending = !landed && state?.pending && state.pending !== active ? state.pending : null;

  const choose = useCallback(
    async (key) => {
      if (!userId) return;

      // Tomorrow, in the reader's own local day — the same clock the feed uses.
      const tomorrow = todayLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const next = { active, pending: key, pendingFrom: tomorrow };

      // Optimistic: the choice is visible immediately even though it does not
      // take effect until tomorrow, and a failed write costs a preference
      // rather than anything the reader would notice mid-session.
      setState(next);
      await cache.saveJson?.(userId, KEY, next);
    },
    [active, cache, userId],
  );

  return {
    loading,
    /** Reads today's session. */
    active,
    /** Chosen but not yet in effect, or null. */
    pending,
    voice: voiceByKey(active),
    choose,
  };
}
