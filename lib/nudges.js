/**
 * When to ask for one more piece of the profile — and, more importantly, when to
 * stop asking.
 *
 * Onboarding deliberately collects only part of what makes an affirmation feel
 * personal; the rest is meant to arrive later, one question at a time. That only
 * works if the asking is rare and gives up gracefully. A nudge that shows every
 * launch is an ad for our own form.
 *
 * Pure and date-string based ("YYYY-MM-DD", lexicographically comparable) so the
 * whole policy is unit-testable without a clock, a store, or a render.
 */
import { addDays, todayLocal } from "./dates.js";

/** Days after first launch before the first nudge. Never ask on day one. */
export const GRACE_DAYS = 2;

/** Quiet period after an answer, so answering never summons another question. */
export const COOLDOWN_DAYS = 3;

/**
 * Backoff after each consecutive "not now". Escalates, then gives up for a
 * season — three refusals is an answer.
 */
export const SNOOZE_DAYS = [4, 10, 30];
export const REST_DAYS = 90;

/**
 * Above this we stop asking entirely. Not 100: the last few fields are the
 * sensitive ones, and hounding someone for their religion to fill a meter is
 * exactly the behaviour this module exists to prevent.
 */
export const ENOUGH_PERCENT = 90;

export function initialNudgeState(today = todayLocal()) {
  return {
    firstSeenAt: today,
    snoozedUntil: addDays(today, GRACE_DAYS),
    dismissals: 0,
    answered: 0,
  };
}

/**
 * The one question to ask right now, or null to stay quiet.
 *
 * `suggestions` comes from the API already ordered non-sensitive-first, so
 * taking the head means we never open with faith, mood, or relationship status.
 */
export function nextNudge({ suggestions = [], completeness, state, today = todayLocal() }) {
  if (!state) return null;
  if (suggestions.length === 0) return null;
  if ((completeness?.percent ?? 0) >= ENOUGH_PERCENT) return null;
  if (state.snoozedUntil && today < state.snoozedUntil) return null;

  return suggestions[0];
}

export function afterDismiss(state, today = todayLocal()) {
  const dismissals = (state?.dismissals ?? 0) + 1;
  const wait = SNOOZE_DAYS[dismissals - 1] ?? REST_DAYS;

  return { ...state, dismissals, snoozedUntil: addDays(today, wait) };
}

export function afterAnswer(state, today = todayLocal()) {
  return {
    ...state,
    // Answering clears the refusal streak — willingness came back, so the
    // backoff shouldn't keep punishing them for last month's "not now".
    dismissals: 0,
    answered: (state?.answered ?? 0) + 1,
    lastAnsweredAt: today,
    snoozedUntil: addDays(today, COOLDOWN_DAYS),
  };
}
