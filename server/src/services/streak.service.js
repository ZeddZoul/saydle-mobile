import { addDays, dateRange, daysBetween, startOfWeek } from "../utils/dates.js";

/**
 * Streaks are derived, not stored — a FeedEntry with `seenAt` set is the record
 * that a day was read. That means there is no counter to drift out of sync, and
 * back-filling or correcting a day fixes the streak automatically.
 *
 * Pure functions over "YYYY-MM-DD" strings in the user's timezone.
 */

/**
 * @param {string[]} seenDates  days the user read an affirmation, any order
 * @param {string}   today      today in the user's timezone
 */
export function computeStreak(seenDates, today) {
  const seen = new Set(seenDates);

  // A streak stays alive until a whole day is missed: if today hasn't been read
  // yet, we count back from yesterday rather than breaking it prematurely.
  const anchor = seen.has(today) ? today : addDays(today, -1);

  let current = 0;
  let cursor = anchor;
  while (seen.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const date of [...seen].sort()) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }

  return { current, longest, seenToday: seen.has(today) };
}

/**
 * The current Monday–Sunday week, so the strip shows both the days already
 * earned and the ones still ahead. The client formats the weekday labels, since
 * that is locale-dependent.
 */
export function weekStrip(seenDates, today) {
  const seen = new Set(seenDates);

  return dateRange(startOfWeek(today), 7).map((date) => ({
    date,
    seen: seen.has(date),
    isToday: date === today,
    isFuture: date > today,
  }));
}
