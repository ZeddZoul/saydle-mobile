import {
  timesFromTiming,
  isValidTime,
  atLocalTime,
  buildReminderPlan,
  MAX_SCHEDULED,
} from "../../lib/reminders.js";

const entry = (date, text) => ({ date, affirmation: { id: `a-${date}`, text } });

// A fixed "now": 2026-08-04 09:00 local.
const NOW = new Date(2026, 7, 4, 9, 0, 0);

describe("timesFromTiming", () => {
  it("maps onboarding slugs to sorted clock times", () => {
    expect(timesFromTiming(["evening", "first-thing"])).toEqual(["07:30", "18:30"]);
  });

  it("ignores unknown slugs and dedupes", () => {
    expect(timesFromTiming(["midday", "midday", "nonsense"])).toEqual(["12:30"]);
  });

  it("returns nothing for no selection", () => {
    expect(timesFromTiming([])).toEqual([]);
  });
});

describe("isValidTime", () => {
  it.each(["00:00", "07:30", "23:59"])("accepts %s", (t) => {
    expect(isValidTime(t)).toBe(true);
  });

  it.each(["24:00", "7:30", "07:60", "0730", "", null])("rejects %j", (t) => {
    expect(isValidTime(t)).toBe(false);
  });
});

describe("atLocalTime", () => {
  it("builds a local Date for the given day and time", () => {
    const at = atLocalTime("2026-08-04", "18:30");
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(7);
    expect(at.getDate()).toBe(4);
    expect(at.getHours()).toBe(18);
    expect(at.getMinutes()).toBe(30);
  });
});

describe("buildReminderPlan", () => {
  const entries = [
    entry("2026-08-04", "I can begin before I feel ready."),
    entry("2026-08-05", "I am allowed to rest."),
  ];

  it("schedules the real affirmation text for each day", () => {
    const plan = buildReminderPlan({ entries, times: ["18:30"], now: NOW });

    expect(plan[0]).toMatchObject({
      date: "2026-08-04",
      time: "18:30",
      body: "I can begin before I feel ready.",
    });
  });

  it("skips times that have already passed today", () => {
    // 07:30 is behind 09:00; 18:30 is still ahead.
    const plan = buildReminderPlan({ entries, times: ["07:30", "18:30"], now: NOW });

    const today = plan.filter((p) => p.date === "2026-08-04");
    expect(today.map((p) => p.time)).toEqual(["18:30"]);
  });

  it("still schedules the passed time on later days", () => {
    const plan = buildReminderPlan({ entries, times: ["07:30"], now: NOW });

    expect(plan.map((p) => p.date)).toEqual(["2026-08-05"]);
  });

  it("skips days with no cached affirmation rather than nudging into nothing", () => {
    const plan = buildReminderPlan({
      entries: [entry("2026-08-06", "I let today end unfinished.")],
      times: ["18:30"],
      now: NOW,
    });

    expect(plan.map((p) => p.date)).toEqual(["2026-08-06"]);
  });

  it("returns soonest first", () => {
    const plan = buildReminderPlan({ entries, times: ["12:30", "18:30"], now: NOW });
    const timestamps = plan.map((p) => p.at.getTime());

    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("schedules nothing without any times", () => {
    expect(buildReminderPlan({ entries, times: [], now: NOW })).toEqual([]);
  });

  it("ignores malformed times", () => {
    expect(buildReminderPlan({ entries, times: ["25:00", "bogus"], now: NOW })).toEqual([]);
  });

  it("stays under the platform's pending-notification ceiling", () => {
    const many = Array.from({ length: 30 }, (_, i) => {
      const day = String(4 + i).padStart(2, "0");
      return entry(`2026-08-${day}`, `Affirmation ${i}`);
    });

    const plan = buildReminderPlan({
      entries: many,
      times: ["08:00", "10:00", "12:00", "14:00", "16:00", "20:00"],
      now: NOW,
      windowDays: 30,
    });

    expect(plan.length).toBeLessThanOrEqual(MAX_SCHEDULED);
  });

  it("never schedules in the past", () => {
    const plan = buildReminderPlan({ entries, times: ["08:00", "23:00"], now: NOW });
    for (const item of plan) {
      expect(item.at.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });
});
