import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import { FeedEntry } from "../src/models/FeedEntry.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { todayInZone } from "../src/utils/dates.js";

const app = createApp();

let auth;
let user;
let today;

const shift = (date, days) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Backdates a day into the reader's past, optionally marked as seen. */
async function pastDay(date, { seen = true } = {}) {
  const affirmation = await Affirmation.findOne({ source: "curated" });
  await FeedEntry.create({
    user: user._id,
    date,
    affirmation: affirmation._id,
    seenAt: seen ? new Date(`${date}T09:00:00Z`) : null,
  });
}

beforeEach(async () => {
  await seed();
  const registered = await registerUser(app, { email: "history@example.com" });
  auth = registered.auth;
  user = await User.findById(registered.user.id);
  today = todayInZone(user.timezone);
});

describe("GET /api/affirmations/history", () => {
  it("returns days already behind the reader, newest first", async () => {
    await pastDay(shift(today, -1));
    await pastDay(shift(today, -3));
    await pastDay(shift(today, -2));

    const res = await request(app).get("/api/affirmations/history").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.date)).toEqual([
      shift(today, -1),
      shift(today, -2),
      shift(today, -3),
    ]);
  });

  it("never reaches forward into the scheduled buffer", async () => {
    // The buffer runs weeks ahead; scrolling into it would turn a daily line
    // into a list, which is the one thing the product is arranged to avoid.
    const res = await request(app).get("/api/affirmations/history").set("Authorization", auth);

    const future = res.body.entries.filter((e) => e.date >= today);
    expect(future).toEqual([]);
  });

  it("excludes today itself", async () => {
    await request(app).get("/api/affirmations/today").set("Authorization", auth);

    const res = await request(app).get("/api/affirmations/history").set("Authorization", auth);
    expect(res.body.entries.map((e) => e.date)).not.toContain(today);
  });

  it("skips past days the app was never opened on", async () => {
    await pastDay(shift(today, -1), { seen: true });
    await pastDay(shift(today, -2), { seen: false });

    // An unseen past day is a memory the reader never had.
    const res = await request(app).get("/api/affirmations/history").set("Authorization", auth);
    expect(res.body.entries.map((e) => e.date)).toEqual([shift(today, -1)]);
  });

  it("pages further back from a cursor", async () => {
    for (let i = 1; i <= 4; i += 1) await pastDay(shift(today, -i));

    const res = await request(app)
      .get(`/api/affirmations/history?before=${shift(today, -2)}`)
      .set("Authorization", auth);

    expect(res.body.entries.map((e) => e.date)).toEqual([shift(today, -3), shift(today, -4)]);
  });

  it("ignores a cursor that points into the future", async () => {
    await pastDay(shift(today, -1));

    const res = await request(app)
      .get(`/api/affirmations/history?before=${shift(today, 30)}`)
      .set("Authorization", auth);

    expect(res.body.entries.map((e) => e.date)).toEqual([shift(today, -1)]);
  });

  it("caps how much it will hand over at once", async () => {
    for (let i = 1; i <= 12; i += 1) await pastDay(shift(today, -i));

    const res = await request(app)
      .get("/api/affirmations/history?days=5")
      .set("Authorization", auth);

    expect(res.body.entries).toHaveLength(5);
  });

  it("rejects a malformed cursor", async () => {
    const res = await request(app)
      .get("/api/affirmations/history?before=yesterday")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
  });

  it("carries the affirmation text, not just a reference", async () => {
    await pastDay(shift(today, -1));

    const res = await request(app).get("/api/affirmations/history").set("Authorization", auth);
    expect(res.body.entries[0].affirmation.text).toBeTruthy();
  });

  it("requires a session", async () => {
    await request(app).get("/api/affirmations/history").expect(401);
  });
});
