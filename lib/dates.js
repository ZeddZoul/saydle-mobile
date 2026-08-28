/**
 * Device-local calendar day as "YYYY-MM-DD", matching the server's format.
 *
 * The client computes this itself rather than trusting the `today` value the
 * server sent, because a cached feed has to roll over to the next day correctly
 * with no network at all.
 */
export function todayLocal(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The device's IANA timezone, sent at registration so the server can schedule. */
export function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Shifts a "YYYY-MM-DD" day by whole days. UTC arithmetic on a date-only value,
 * so a DST change can't nudge it onto the wrong day.
 */
export function addDays(dateString, days) {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Single-letter-ish weekday label for a "YYYY-MM-DD" day, e.g. "Mon". */
export function weekdayShort(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(y, m - 1, d));
}

export function formatFriendlyDate(dateString) {
  // Callers pass a day that may not exist — a shared library line has no date.
  // Returning empty beats throwing inside a render, which takes the screen down
  // rather than dropping one line of text.
  if (!dateString) return "";

  const [y, m, d] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}
