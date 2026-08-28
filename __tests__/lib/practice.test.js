import {
  DEFAULT_TARGET,
  HISTORY_DAYS,
  isComplete,
  mergeSession,
  practiceStreak,
  practisedOn,
  progress,
  recordRep,
  startSession,
} from "../../lib/practice.js";

const TODAY = "2026-08-05";
const session = (over = {}) => ({
  date: TODAY,
  affirmationId: "a1",
  target: 3,
  count: 0,
  completedAt: null,
  ...over,
});

const finished = (date, affirmationId = "a1") => ({
  date,
  affirmationId,
  target: 3,
  count: 3,
  completedAt: `${date}T09:00:00.000Z`,
});

describe("startSession", () => {
  it("starts empty, with a short target", () => {
    const fresh = startSession({ date: TODAY, affirmationId: "a1" });

    expect(fresh).toMatchObject({ count: 0, completedAt: null, target: DEFAULT_TARGET });
    // Repetition past the point of meaning turns a ritual into a chore.
    expect(DEFAULT_TARGET).toBeLessThanOrEqual(10);
  });
});

describe("recordRep", () => {
  it("counts up one at a time", () => {
    expect(recordRep(session()).count).toBe(1);
    expect(recordRep(recordRep(session())).count).toBe(2);
  });

  it("completes exactly on the target", () => {
    let current = session();
    for (let i = 0; i < 3; i += 1) current = recordRep(current);

    expect(isComplete(current)).toBe(true);
    expect(current.count).toBe(3);
  });

  it("refuses to count past the target", () => {
    // An unbounded counter invites "more is better", which is the opposite of
    // what this is for.
    let current = session();
    for (let i = 0; i < 10; i += 1) current = recordRep(current);

    expect(current.count).toBe(3);
  });

  it("does not move the completion time on a late extra tap", () => {
    const complete = session({ count: 3, completedAt: "2026-08-05T09:00:00.000Z" });
    expect(recordRep(complete)).toBe(complete);
  });

  it("survives being handed nothing", () => {
    expect(recordRep(null)).toBeNull();
  });
});

describe("progress", () => {
  it("reports the fraction done, clamped", () => {
    expect(progress(session({ count: 0 }))).toBe(0);
    expect(progress(session({ count: 3 }))).toBe(1);
    expect(progress(session({ count: 9 }))).toBe(1);
    expect(progress(null)).toBe(0);
  });
});

describe("mergeSession", () => {
  it("keeps one entry per affirmation per day, not a tally", () => {
    // Practising the same line twice is one thing done well.
    const history = mergeSession([finished(TODAY)], finished(TODAY), { today: TODAY });

    expect(history).toHaveLength(1);
  });

  it("keeps separate entries for different affirmations on the same day", () => {
    const history = mergeSession([finished(TODAY, "a1")], finished(TODAY, "a2"), {
      today: TODAY,
    });

    expect(history).toHaveLength(2);
  });

  it("drops sessions older than the history window", () => {
    // A habit tracker, not a diary.
    const ancient = finished("2026-01-01");
    const history = mergeSession([ancient], finished(TODAY), { today: TODAY });

    expect(history.map((e) => e.date)).toEqual([TODAY]);
    expect(HISTORY_DAYS).toBeLessThanOrEqual(90);
  });

  it("keeps history in date order", () => {
    const history = mergeSession(
      [finished("2026-08-04"), finished("2026-08-02")],
      finished(TODAY),
      { today: TODAY },
    );

    expect(history.map((e) => e.date)).toEqual(["2026-08-02", "2026-08-04", TODAY]);
  });
});

describe("practisedOn", () => {
  it("only counts a session that was actually finished", () => {
    expect(practisedOn([finished(TODAY)], TODAY)).toBe(true);
    expect(practisedOn([session({ count: 2 })], TODAY)).toBe(false);
    expect(practisedOn([], TODAY)).toBe(false);
  });
});

describe("practiceStreak", () => {
  it("counts consecutive days ending today", () => {
    const history = ["2026-08-03", "2026-08-04", TODAY].map((d) => finished(d));
    expect(practiceStreak(history, TODAY)).toBe(3);
  });

  it("still counts a run that ended yesterday", () => {
    // A streak that reads zero at breakfast punishes the time of day rather
    // than anything the person did.
    const history = ["2026-08-03", "2026-08-04"].map((d) => finished(d));
    expect(practiceStreak(history, TODAY)).toBe(2);
  });

  it("is broken by a missed day", () => {
    const history = ["2026-08-01", "2026-08-02", TODAY].map((d) => finished(d));
    expect(practiceStreak(history, TODAY)).toBe(1);
  });

  it("is zero once two days have passed", () => {
    expect(practiceStreak([finished("2026-08-03")], TODAY)).toBe(0);
  });

  it("is zero with no history at all", () => {
    expect(practiceStreak([], TODAY)).toBe(0);
  });

  it("crosses a month boundary correctly", () => {
    const history = ["2026-07-30", "2026-07-31", "2026-08-01"].map((d) => finished(d));
    expect(practiceStreak(history, "2026-08-01")).toBe(3);
  });
});
