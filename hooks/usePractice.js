import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { todayLocal } from "../lib/dates.js";
import {
  DEFAULT_TARGET,
  isComplete,
  mergeSession,
  practiceStreak,
  practisedOn,
  recordRep,
  startSession,
} from "../lib/practice.js";

/**
 * A practice session for one affirmation.
 *
 * Entirely local, and deliberately so — see lib/cache.js. It also means practice
 * works with no network at all, which matters for something people do in bed
 * and on trains.
 */
export function usePractice(affirmation, { target = DEFAULT_TARGET } = {}) {
  const { user, cache } = useAuth();
  const userId = user?.id;
  const today = todayLocal();

  const [history, setHistory] = useState([]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    cache.loadPractice(userId).then((saved) => {
      if (!cancelled) {
        setHistory(saved ?? []);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId, cache]);

  // A new affirmation means a new session; the same one resumes where it was.
  useEffect(() => {
    if (!affirmation?.id) return;

    const existing = history.find(
      (entry) => entry.date === today && entry.affirmationId === affirmation.id,
    );

    setSession(existing ?? startSession({ date: today, affirmationId: affirmation.id, target }));
  }, [affirmation?.id, history, today, target]);

  const rep = useCallback(async () => {
    if (!session) return null;

    const next = recordRep(session);
    setSession(next);

    // Persisted only on completion. A half-finished session that survives a
    // relaunch would greet someone with "4 of 7" from a moment they'd moved on
    // from — better to let an abandoned session simply be abandoned.
    if (isComplete(next) && !isComplete(session)) {
      const merged = mergeSession(history, next, { today });
      setHistory(merged);
      if (userId) await cache.savePractice(userId, merged);
    }

    return next;
  }, [session, history, today, userId, cache]);

  const reset = useCallback(() => {
    if (!affirmation?.id) return;
    setSession(startSession({ date: today, affirmationId: affirmation.id, target }));
  }, [affirmation?.id, today, target]);

  return {
    session,
    loading,
    complete: isComplete(session),
    practisedToday: practisedOn(history, today),
    streak: practiceStreak(history, today),
    rep,
    reset,
  };
}
