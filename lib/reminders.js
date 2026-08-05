import { addDays, todayLocal } from "./dates.js";

/**
 * Reminder scheduling — pure logic, no native calls (see lib/notifications.js
 * for the expo-notifications wrapper).
 *
 * These are LOCAL notifications, deliberately, not push:
 *   - they fire with no network, which is the whole point of a morning ritual;
 *   - no device tokens, no server scheduling, no per-timezone cron;
 *   - and because the feed is generated ahead of time and cached, each one can
 *     carry the actual affirmation for that day rather than a generic nudge.
 *
 * The cost is that they must be re-scheduled periodically (on app foreground),
 * since we only queue a window at a time.
 */

/** The onboarding timing slugs, mapped to real clock times. */
export const TIMING_TIMES = {
  "first-thing": "07:30",
  "mid-morning": "10:00",
  midday: "12:30",
  evening: "18:30",
  "before-bed": "21:30",
};

export const DEFAULT_TIMES = ["08:00"];

// iOS silently drops pending local notifications past 64. Staying well under it
// leaves room for anything else the app might schedule later.
export const MAX_SCHEDULED = 56;
const DEFAULT_WINDOW_DAYS = 7;

/** Turns the onboarding `reminderTiming` answers into sorted clock times. */
export function timesFromTiming(slugs = []) {
  const times = slugs.map((slug) => TIMING_TIMES[slug]).filter(Boolean);
  return [...new Set(times)].sort();
}

export function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The most reminders a day may hold — matches the server's cap. */
export const MAX_PER_DAY = 20;

export const DEFAULT_WINDOW = { start: "09:00", end: "22:00" };

export const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const toClock = (minutes) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = String(Math.floor(clamped / 60)).padStart(2, "0");
  const m = String(clamped % 60).padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * Spreads `count` reminders evenly across a [start, end] window — the model the
 * setup screen presents ("10× between 09:00 and 22:00") reduced to the plain
 * list of times everything downstream actually uses.
 *
 * First lands on `start`, last on `end`. Times that collide after rounding are
 * deduped, so a very tight window simply yields fewer reminders.
 */
export function spreadTimes(count, startTime = DEFAULT_WINDOW.start, endTime = DEFAULT_WINDOW.end) {
  if (!Number.isFinite(count) || count <= 0) return [];
  if (!isValidTime(startTime) || !isValidTime(endTime)) return [];

  const capped = Math.min(Math.floor(count), MAX_PER_DAY);
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  // A window that doesn't run forwards can only hold the opening reminder.
  if (end <= start || capped === 1) return [toClock(start)];

  const step = (end - start) / (capped - 1);
  const times = Array.from({ length: capped }, (_, i) => toClock(start + i * step));

  return [...new Set(times)];
}

/** A Date at `time` ("HH:MM") on `date` ("YYYY-MM-DD"), in device-local time. */
export function atLocalTime(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/**
 * Builds the list of notifications to schedule from the cached feed.
 *
 * Only days we actually have an affirmation for are scheduled — a reminder that
 * opens to nothing is worse than no reminder.
 *
 * @returns {{date: string, time: string, at: Date, body: string}[]} soonest first
 */
export function buildReminderPlan({
  entries = [],
  times = [],
  now = new Date(),
  windowDays = DEFAULT_WINDOW_DAYS,
  max = MAX_SCHEDULED,
} = {}) {
  const validTimes = times.filter(isValidTime);
  if (validTimes.length === 0) return [];

  const textByDate = new Map(
    entries
      .filter((e) => e?.date && e?.affirmation?.text)
      .map((e) => [e.date, e.affirmation.text]),
  );

  const start = todayLocal(now);
  const plan = [];

  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = addDays(start, offset);
    const body = textByDate.get(date);
    if (!body) continue;

    for (const time of validTimes) {
      const at = atLocalTime(date, time);
      // Skip times already past — scheduling in the past fires immediately.
      if (at.getTime() <= now.getTime()) continue;
      plan.push({ date, time, at, body });
    }
  }

  return plan.sort((a, b) => a.at - b.at).slice(0, max);
}
