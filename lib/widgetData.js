/**
 * What the home-screen widget is given.
 *
 * A widget has no network, no session, and no chance to ask a question. It
 * renders whatever the app last handed it, possibly days later, possibly while
 * the phone is offline in a drawer. So this builds a self-contained snapshot:
 * enough days ahead that it keeps working without the app being opened, and
 * every colour resolved up front because the widget cannot read our theme.
 *
 * Pure and platform-free, so the decisions that matter — what happens when the
 * feed is empty, how long a snapshot lasts — are testable without native code.
 */

/** Days of affirmations to hand over. Beyond this, the widget shows the last one. */
export const WIDGET_DAYS = 14;

// Widgets are small and their type does not reflow the way the app's does. This
// is where a 96-character affirmation would otherwise be clipped mid-word.
export const MAX_TEXT = 90;

const truncate = (text) => {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length <= MAX_TEXT) return trimmed;

  // Cut at a word boundary — a widget reading "I am allowed to take up spa…" is
  // worse than one reading a shorter whole thought.
  const cut = trimmed.slice(0, MAX_TEXT - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_TEXT * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/**
 * Builds the snapshot.
 *
 * Entries are keyed by date so the widget can pick today's without knowing
 * anything about our scheduling — it just formats its own date and looks it up.
 * Days already past are dropped: a widget is a window on today, not an archive.
 */
export function buildWidgetPayload({ entries = [], theme, today, days = WIDGET_DAYS }) {
  const upcoming = entries
    .filter((entry) => entry?.date && entry.date >= today && entry.affirmation?.text)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, days);

  return {
    // Bumped if the shape ever changes, so an old widget binary paired with a
    // new app can tell rather than mis-render.
    version: 1,
    updatedAt: today,
    days: upcoming.map((entry) => ({
      date: entry.date,
      text: truncate(entry.affirmation.text),
    })),
    theme: {
      // Resolved here because the widget process has no access to theme/themes.js.
      slug: theme?.slug ?? "dawn",
      gradientStart: theme?.gradient?.[0] ?? "#FDEEEC",
      gradientEnd: theme?.gradient?.[1] ?? "#F7CAC5",
      ink: theme?.ink ?? "#38223A",
      accent: theme?.accent ?? "#FF6F61",
      dark: Boolean(theme?.dark),
    },
  };
}

/**
 * Whether a new snapshot is worth writing.
 *
 * Writing to the shared container wakes the widget timeline, so doing it on
 * every render would spend battery to change nothing. Comparing the payload is
 * cheaper than the write it avoids.
 */
export function widgetPayloadChanged(previous, next) {
  if (!previous) return true;
  return JSON.stringify(previous) !== JSON.stringify(next);
}
