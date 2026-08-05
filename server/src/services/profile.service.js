import { COUNTED_FIELDS } from "../config/profileFields.js";

const isFilled = (v) =>
  Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";

// Core onboarding signals live on `preferences`, not `profile`, but they count
// toward "how personalized are you" all the same. (firstName is required, so it
// is always present and not worth counting.)
const CORE_SIGNALS = [
  { key: "topics", filled: (u) => (u.preferences?.categories?.length ?? 0) > 0 },
  { key: "focus", filled: (u) => Boolean((u.preferences?.focus ?? "").trim()) },
];

/**
 * A 0–100 "how personalized are you" score over the core signals plus every
 * counted profile field. Drives the completeness meter and the nudge cadence —
 * content is never gated on it.
 */
export function completeness(user) {
  const profile = user.profile ?? {};
  const items = [
    ...CORE_SIGNALS.map((s) => s.filled(user)),
    ...COUNTED_FIELDS.map((f) => isFilled(profile[f.key])),
  ];

  const filled = items.filter(Boolean).length;
  const total = items.length;
  return { filled, total, percent: total === 0 ? 0 : Math.round((filled / total) * 100) };
}

/**
 * The next few unanswered questions to nudge, non-sensitive first — we never
 * lead a nudge with faith, mood, or relationship status.
 */
export function nextSuggestions(user, limit = 3) {
  const profile = user.profile ?? {};

  return COUNTED_FIELDS.filter((f) => !isFilled(profile[f.key]))
    .sort((a, b) => (a.sensitive ? 1 : 0) - (b.sensitive ? 1 : 0))
    .slice(0, limit)
    .map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      options: f.options,
      sensitive: Boolean(f.sensitive),
    }));
}
