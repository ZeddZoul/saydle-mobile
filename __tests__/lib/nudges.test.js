import {
  COOLDOWN_DAYS,
  ENOUGH_PERCENT,
  GRACE_DAYS,
  REST_DAYS,
  SNOOZE_DAYS,
  afterAnswer,
  afterDismiss,
  initialNudgeState,
  nextNudge,
} from "../../lib/nudges.js";

const TODAY = "2026-08-05";
const suggestions = [
  { key: "values", kind: "multi", label: "What matters to you" },
  { key: "religion", kind: "single", label: "Faith" },
];
const half = { filled: 5, total: 20, percent: 25 };

const ask = (over = {}) =>
  nextNudge({ suggestions, completeness: half, state: initialNudgeState(TODAY), today: TODAY, ...over });

describe("initialNudgeState", () => {
  it("starts inside a grace period, so day one is never a nudge", () => {
    const state = initialNudgeState(TODAY);
    expect(state.snoozedUntil).toBe("2026-08-07");
    expect(nextNudge({ suggestions, completeness: half, state, today: TODAY })).toBeNull();
    expect(GRACE_DAYS).toBe(2);
  });
});

describe("nextNudge", () => {
  it("asks the first suggestion once the grace period is over", () => {
    expect(ask({ today: "2026-08-07" })).toEqual(suggestions[0]);
  });

  it("stays quiet with nothing left to ask", () => {
    expect(ask({ today: "2026-08-07", suggestions: [] })).toBeNull();
  });

  it("stops asking once the profile is personalized enough", () => {
    // Deliberately below 100 — the last fields are the sensitive ones.
    expect(ENOUGH_PERCENT).toBeLessThan(100);
    expect(
      ask({ today: "2026-08-07", completeness: { percent: ENOUGH_PERCENT } }),
    ).toBeNull();
  });

  it("stays quiet before the snooze expires and speaks up on the day it does", () => {
    const state = { snoozedUntil: "2026-08-10", dismissals: 1 };

    expect(ask({ state, today: "2026-08-09" })).toBeNull();
    expect(ask({ state, today: "2026-08-10" })).toEqual(suggestions[0]);
  });

  it("takes the API's order, which puts sensitive questions last", () => {
    // We never open with faith, mood, or relationship status.
    expect(ask({ today: "2026-08-07" }).key).toBe("values");
  });

  it("says nothing before the state has loaded", () => {
    expect(ask({ state: null })).toBeNull();
  });
});

describe("afterDismiss", () => {
  it("backs off further with each consecutive refusal", () => {
    let state = initialNudgeState(TODAY);
    const waits = [];

    for (let i = 0; i < SNOOZE_DAYS.length; i += 1) {
      state = afterDismiss(state, TODAY);
      waits.push(state.snoozedUntil);
    }

    expect(waits).toEqual(["2026-08-09", "2026-08-15", "2026-09-04"]);
    expect(state.dismissals).toBe(3);
  });

  it("gives up for a season past the last backoff step", () => {
    const state = afterDismiss({ dismissals: SNOOZE_DAYS.length }, TODAY);

    expect(state.dismissals).toBe(SNOOZE_DAYS.length + 1);
    // Three refusals is an answer.
    expect(state.snoozedUntil).toBe("2026-11-03");
    expect(REST_DAYS).toBe(90);
  });
});

describe("afterAnswer", () => {
  it("goes quiet for a cooldown so answering never summons another question", () => {
    const state = afterAnswer(initialNudgeState(TODAY), TODAY);

    expect(state.snoozedUntil).toBe("2026-08-08");
    expect(COOLDOWN_DAYS).toBe(3);
    expect(nextNudge({ suggestions, completeness: half, state, today: "2026-08-07" })).toBeNull();
  });

  it("clears the refusal streak — willingness came back", () => {
    const state = afterAnswer({ dismissals: 3 }, TODAY);

    expect(state.dismissals).toBe(0);
    expect(state.answered).toBe(1);
    expect(state.lastAnsweredAt).toBe(TODAY);
  });
});
