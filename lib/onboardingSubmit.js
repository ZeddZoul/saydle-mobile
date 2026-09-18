import { DEFAULT_WINDOW, timesFromTiming } from "./reminders.js";

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
  "reminderTiming",
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

  // The reminders step stores a window directly; the older timing question is
  // still honoured as a fallback. `enabled` is left for the caller to confirm —
  // it must reflect what the OS actually granted, not just what was chosen.
  const chosen = answers.reminders;
  const fallbackTimes = timesFromTiming(answers.reminderTiming ?? []);

  const reminderWindow = chosen?.count
    ? { count: chosen.count, start: chosen.start, end: chosen.end }
    : fallbackTimes.length > 0
      ? {
          count: fallbackTimes.length,
          start: fallbackTimes[0],
          end:
            fallbackTimes[fallbackTimes.length - 1] === fallbackTimes[0]
              ? DEFAULT_WINDOW.end
              : fallbackTimes[fallbackTimes.length - 1],
        }
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

/**
 * Where to send someone once the store has answered.
 *
 * Kept here, beside `buildSignupPayload` and out of the screen, because it is
 * policy rather than layout — and because inline in a three-hundred-line screen
 * it went untested, which is how the version before it shipped.
 *
 * That version navigated to /dashboard the instant StoreKit returned, and the
 * route guard — correctly, because entitlement is server-truth and the webhook
 * had not landed — bounced the buyer straight back to the paywall. Paid, and
 * the next screen is the thing they paid to get past, with nothing said. It is
 * the "we were unable to unlock content after purchase" rejection, and it is
 * also a rotten thing to do to someone who has just handed over money.
 *
 * So: wait for the server, briefly, and only then let go. Nine seconds covers
 * the common case; past that it is kinder to move on and say so than to hold a
 * spinner for the eighty seconds a webhook has actually been measured taking,
 * which is why the slow half of the wait is handed to the locked screen.
 *
 * Nothing here grants anything. `readSubscription` is the server being asked,
 * and its answer is the only thing that decides.
 */
export async function routeAfterPurchase({
  purchase,
  readSubscription,
  refreshUser,
  onConfirming,
  poll,
  delays,
}) {
  const purchased = await purchase();

  // Straight to the paywall screen rather than via /dashboard, which the guard
  // would bounce anyway — one frame of a screen they cannot have.
  if (!purchased) return "/locked";

  onConfirming?.();

  const settled = await poll(readSubscription, (fresh) => fresh.entitled, delays);

  // The guard reads the session, not this response, so it has to be re-read or
  // the app stays shut to someone who just paid for it.
  if (settled) await refreshUser?.();

  // `settling` tells the locked screen this is a sale still in flight, so it
  // keeps asking rather than presenting the offer to someone who has already
  // accepted it.
  return settled ? "/dashboard" : "/locked?settling=1";
}
