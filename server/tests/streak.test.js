import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { computeStreak, weekStrip } from "../src/services/streak.service.js";
import { todayInZone } from "../src/utils/dates.js";

const app = createApp();

beforeEach(async () => {
  await seed();
});

describe("computeStreak", () => {
  it("is zero for someone who has never read a day", () => {
    expect(computeStreak([], "2026-08-04")).toEqual({
      current: 0,
      longest: 0,
      seenToday: false,
    });
  });

  it("counts today alone as a streak of one", () => {
    expect(computeStreak(["2026-08-04"], "2026-08-04")).toMatchObject({
      current: 1,
      longest: 1,
      seenToday: true,
    });
  });

  it("counts consecutive days up to today", () => {
    const days = ["2026-08-02", "2026-08-03", "2026-08-04"];
    expect(computeStreak(days, "2026-08-04")).toMatchObject({ current: 3, longest: 3 });
  });

  it("keeps the streak alive when today has not been read yet", () => {
    // Read yesterday, not yet today — the day isn't over, so nothing is lost.
    const days = ["2026-08-02", "2026-08-03"];
    expect(computeStreak(days, "2026-08-04")).toMatchObject({
      current: 2,
      seenToday: false,
    });
  });

  it("breaks once a whole day is missed", () => {
    // Nothing on the 3rd, so by the 4th the run is over.
    const days = ["2026-08-01", "2026-08-02"];
    expect(computeStreak(days, "2026-08-04")).toMatchObject({ current: 0, longest: 2 });
  });

  it("remembers the longest run even after it breaks", () => {
    const days = [
      "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", // run of 4
      "2026-08-04", // today, run of 1
    ];
    expect(computeStreak(days, "2026-08-04")).toMatchObject({ current: 1, longest: 4 });
  });

  it("counts across a month boundary", () => {
    const days = ["2026-07-30", "2026-07-31", "2026-08-01"];
    expect(computeStreak(days, "2026-08-01")).toMatchObject({ current: 3 });
  });

  it("ignores duplicates and unordered input", () => {
    const days = ["2026-08-04", "2026-08-03", "2026-08-04", "2026-08-02"];
    expect(computeStreak(days, "2026-08-04")).toMatchObject({ current: 3, longest: 3 });
  });
});

describe("weekStrip", () => {
  it("returns Monday to Sunday of the current week", () => {
    // 2026-08-04 is a Tuesday.
    const week = weekStrip([], "2026-08-04");

    expect(week).toHaveLength(7);
    expect(week[0].date).toBe("2026-08-03"); // Monday
    expect(week[6].date).toBe("2026-08-09"); // Sunday
  });

  it("marks seen, today, and future days", () => {
    const week = weekStrip(["2026-08-03"], "2026-08-04");

    expect(week[0]).toMatchObject({ seen: true, isToday: false, isFuture: false });
    expect(week[1]).toMatchObject({ seen: false, isToday: true, isFuture: false });
    expect(week[2]).toMatchObject({ isFuture: true });
  });

  it("handles a Sunday, which must still close the week", () => {
    // 2026-08-09 is a Sunday — it belongs to the week starting 2026-08-03.
    const week = weekStrip([], "2026-08-09");
    expect(week[0].date).toBe("2026-08-03");
    expect(week[6]).toMatchObject({ date: "2026-08-09", isToday: true });
  });
});

describe("GET /api/streak", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/streak")).status).toBe(401);
  });

  it("starts at zero for a new user", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app).get("/api/streak").set("authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ current: 0, longest: 0, seenToday: false });
    expect(res.body.week).toHaveLength(7);
  });

  it("counts a day once the affirmation has been read", async () => {
    const { auth } = await registerUser(app);
    const today = todayInZone("UTC");

    await request(app).get("/api/affirmations/today").set("authorization", auth);
    await request(app)
      .post(`/api/affirmations/feed/${today}/seen`)
      .set("authorization", auth);

    const res = await request(app).get("/api/streak").set("authorization", auth);

    expect(res.body).toMatchObject({ current: 1, longest: 1, seenToday: true });
    expect(res.body.week.find((d) => d.isToday).seen).toBe(true);
  });

  it("keeps streaks separate between users", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const today = todayInZone("UTC");

    await request(app).get("/api/affirmations/today").set("authorization", a.auth);
    await request(app)
      .post(`/api/affirmations/feed/${today}/seen`)
      .set("authorization", a.auth);

    const theirs = await request(app).get("/api/streak").set("authorization", b.auth);
    expect(theirs.body.current).toBe(0);
  });
});
