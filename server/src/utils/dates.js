/**
 * The feed is keyed by calendar day in the *user's* timezone, stored as a plain
 * "YYYY-MM-DD" string. Not a Date — a Date would silently re-anchor to UTC and
 * a user in Auckland would roll over at the wrong moment.
 */

// en-CA formats as YYYY-MM-DD, which is the whole reason it's used here.
const formatterCache = new Map();

function formatterFor(timezone) {
  let fmt = formatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timezone, fmt);
  }
  return fmt;
}

export function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function todayInZone(timezone = "UTC", now = new Date()) {
  const zone = isValidTimezone(timezone) ? timezone : "UTC";
  return formatterFor(zone).format(now);
}

export function addDays(dateString, days) {
  const [y, m, d] = dateString.split("-").map(Number);
  // UTC arithmetic on a date-only value: no DST, no zone drift.
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

export function dateRange(startDate, count) {
  return Array.from({ length: count }, (_, i) => addDays(startDate, i));
}

/** Monday-anchored start of the week containing `dateString`. */
export function startOfWeek(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0=Sunday. Shift so Monday is 0.
  const offset = (utc.getUTCDay() + 6) % 7;
  return addDays(dateString, -offset);
}

export function daysBetween(from, to) {
  const parse = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}
