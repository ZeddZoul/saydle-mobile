/**
 * Practice: saying one affirmation to yourself, deliberately, a handful of
 * times.
 *
 * The whole feature is a counter, so what matters is the shape of the counting.
 * Two decisions carry it:
 *
 *   - The target is small. Repetition past the point of meaning turns a ritual
 *     into a chore, and a chore into an uninstall. Seven is enough to feel
 *     deliberate and short enough to finish while the kettle boils.
 *   - A session is per affirmation per day. Practising today's line twice should
 *     read as one thing done well, not two tallies — and tomorrow starts clean
 *     regardless of what yesterday looked like.
 *
 * Pure, so the counting and the day boundary are testable without a screen.
 */

export const DEFAULT_TARGET = 7;

/** Sessions older than this are dropped: this is a habit tracker, not a diary. */
export const HISTORY_DAYS = 60;

export function startSession({ date, affirmationId, target = DEFAULT_TARGET }) {
  return { date, affirmationId, target, count: 0, completedAt: null };
}

/**
 * Records one repetition.
 *
 * Counting stops at the target rather than running on: an unbounded counter
 * invites "more is better", which is the opposite of what this is for.
 */
export function recordRep(session, { now = new Date() } = {}) {
  if (!session || session.count >= session.target) return session;

  const count = session.count + 1;

  return {
    ...session,
    count,
    completedAt: count >= session.target ? now.toISOString() : null,
  };
}

export const isComplete = (session) => Boolean(session?.completedAt);

export const progress = (session) =>
  session?.target > 0 ? Math.min(1, session.count / session.target) : 0;

/**
 * Folds a finished session into the stored history, replacing any earlier
 * session for the same day and affirmation.
 *
 * Replacing rather than appending is what makes "practised today" a yes/no
 * rather than a score, and stops a second run reading as extra credit.
 */
export function mergeSession(history = [], session, { today = session?.date } = {}) {
  if (!session) return history;

  const others = history.filter(
    (entry) => !(entry.date === session.date && entry.affirmationId === session.affirmationId),
  );

  const cutoff = shiftDate(today, -HISTORY_DAYS);

  return [...others, session]
    .filter((entry) => entry.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Whether anything was practised on a given day. Drives the Today screen's state. */
export const practisedOn = (history = [], date) =>
  history.some((entry) => entry.date === date && entry.completedAt);

/**
 * Consecutive days of practice ending today (or yesterday, if today is still
 * ahead of them).
 *
 * Counting back from yesterday when today is empty is deliberate: a streak that
 * reads zero at breakfast, before the day has had a chance, punishes people for
 * the time of day rather than for missing anything.
 */
export function practiceStreak(history = [], today) {
  const done = new Set(history.filter((e) => e.completedAt).map((e) => e.date));
  if (done.size === 0) return 0;

  let cursor = done.has(today) ? today : shiftDate(today, -1);
  if (!done.has(cursor)) return 0;

  let streak = 0;
  while (done.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  return streak;
}

/** UTC arithmetic on a date-only value, so a DST change can't shift the day. */
function shiftDate(dateString, days) {
  const [y, m, d] = String(dateString).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
