/**
 * Turns the collected onboarding answers into the API calls the flow makes at
 * the end: register (firstName/email/password), preferences (tone + a composed
 * free-text focus), and profile (the structured enum answers).
 *
 * Kept a pure function so the mapping is unit-testable without the whole flow.
 * Keys here must match server/src/config/profileFields.js for the profile PATCH
 * to validate.
 */

// Enum answers that go straight to the profile (keys match profileFields.js).
const PROFILE_KEYS = [
  "ageBand",
  "recentMood",
  "feelingCauses",
  "relationshipStatus",
  "employmentStatus",
  "supportAreas",
  "values",
  "motivation",
  "innerCritic",
  "religion",
  "beliefs",
  "zodiac",
  "affirmationFamiliarity",
  "targetFeelings",
  "mentalHealthPractices",
  "selfCareBarriers",
  "habitHelpers",
  "dailyGoalMinutes",
  // Free text — stored individually so the prompt can label each one, rather
  // than joined into a single unattributed string.
  "goal",
  "limitingBelief",
  "aspiration",
  "weighing",
  "feelingCausesOther",
  "employmentStatusOther",
  "beliefsOther",
];

// `preferences.focus` stays a short human-readable summary — it is what the
// Profile screen shows and lets the user edit. The individual answers above are
// what the prompt actually reads.
const FOCUS_SUMMARY_KEYS = ["goal", "limitingBelief"];

const isEmpty = (v) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

export function buildSignupPayload(answers = {}) {
  const profile = {};
  for (const key of PROFILE_KEYS) {
    if (!isEmpty(answers[key])) profile[key] = answers[key];
  }

  const focus = FOCUS_SUMMARY_KEYS.map((k) => answers[k])
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => v.trim())
    .join(". ")
    .slice(0, 500);

  const preferences = {};
  if (answers.tone) preferences.tone = answers.tone;
  if (answers.theme) preferences.theme = answers.theme;
  if (focus) preferences.focus = focus;

  // The reminders step stores a window directly — and always stores one when
  // the step is completed rather than skipped (see OnboardingStep). `enabled`
  // is left for the caller to confirm: it must reflect what the OS actually
  // granted, not just what was chosen.
  const chosen = answers.reminders;
  const reminderWindow = chosen?.count
    ? { count: chosen.count, start: chosen.start, end: chosen.end }
    : null;

  return {
    account: {
      firstName: (answers.callName ?? "").trim() || "Friend",
      lastName: "",
      email: answers.email,
      password: answers.password,
    },
    preferences,
    profile,
    reminderWindow,
  };
}
