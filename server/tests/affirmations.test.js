import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { User } from "../src/models/User.js";
import { todayInZone, addDays } from "../src/utils/dates.js";

const app = createApp();

// AI_ENABLED is false in the test env, so everything here exercises the curated
// fallback path — which is exactly the path a Vertex outage takes in production.
beforeEach(async () => {
  await seed();
});

describe("GET /api/affirmations/today", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/affirmations/today")).status).toBe(401);
  });

  it("schedules and returns an affirmation for a brand new user", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .get("/api/affirmations/today")
      .set("authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.entry.affirmation.text).toEqual(expect.any(String));
    expect(res.body.entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the same affirmation on every call that day", async () => {
    const { auth } = await registerUser(app);

    const first = await request(app)
      .get("/api/affirmations/today")
      .set("authorization", auth);
    const second = await request(app)
      .get("/api/affirmations/today")
      .set("authorization", auth);

    expect(second.body.entry.affirmation.id).toBe(first.body.entry.affirmation.id);
  });

  it("never leaks the owning user id", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .get("/api/affirmations/today")
      .set("authorization", auth);

    expect(res.body.entry.affirmation).not.toHaveProperty("user");
    expect(res.body.entry.affirmation).not.toHaveProperty("textKey");
  });
});

describe("GET /api/affirmations/feed", () => {
  it("returns a contiguous run of future days for offline caching", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .get("/api/affirmations/feed?days=7")
      .set("authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(7);

    const dates = res.body.entries.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(7);
    expect(dates[0]).toBe(res.body.today);
    expect(dates[6]).toBe(addDays(dates[0], 6));
  });

  it("includes the client's date and timezone so it can render offline", async () => {
    const { auth } = await registerUser(app, { timezone: "Pacific/Auckland" });

    const res = await request(app)
      .get("/api/affirmations/feed?days=3")
      .set("authorization", auth);

    expect(res.body.timezone).toBe("Pacific/Auckland");
    expect(res.body.today).toBe(todayInZone("Pacific/Auckland"));
  });

  it("embeds the full affirmation text, not just an id", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .get("/api/affirmations/feed?days=2")
      .set("authorization", auth);

    for (const entry of res.body.entries) {
      expect(entry.affirmation.text).toEqual(expect.any(String));
      expect(entry.affirmation.categorySlug).toEqual(expect.any(String));
    }
  });

  it("clamps an oversized request to the sync ceiling", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .get("/api/affirmations/feed?days=120")
      .set("authorization", auth);

    expect(res.body.entries.length).toBeLessThanOrEqual(30);
  });

  it("rejects a nonsense days value", async () => {
    const { auth } = await registerUser(app);

    for (const days of ["0", "-5", "abc", "999"]) {
      const res = await request(app)
        .get(`/api/affirmations/feed?days=${days}`)
        .set("authorization", auth);
      expect(res.status, days).toBe(400);
    }
  });

  it("does not reshuffle days that were already scheduled", async () => {
    const { auth } = await registerUser(app);

    const first = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);
    const second = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);

    expect(second.body.entries.map((e) => e.affirmation.id)).toEqual(
      first.body.entries.map((e) => e.affirmation.id),
    );
  });

  it("keeps users' feeds separate", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);

    const feedA = await request(app)
      .get("/api/affirmations/feed?days=3")
      .set("authorization", a.auth);
    const feedB = await request(app)
      .get("/api/affirmations/feed?days=3")
      .set("authorization", b.auth);

    expect(feedA.body.entries).toHaveLength(3);
    expect(feedB.body.entries).toHaveLength(3);
  });
});

describe("POST /api/affirmations/feed/:date/seen", () => {
  it("marks the day seen and tolerates being called again", async () => {
    const { auth } = await registerUser(app);
    const today = todayInZone("UTC");

    await request(app).get("/api/affirmations/today").set("authorization", auth);

    const first = await request(app)
      .post(`/api/affirmations/feed/${today}/seen`)
      .set("authorization", auth);

    expect(first.status).toBe(200);
    expect(first.body.seenAt).not.toBeNull();

    const second = await request(app)
      .post(`/api/affirmations/feed/${today}/seen`)
      .set("authorization", auth);

    expect(second.status).toBe(200);
  });

  it("rejects a malformed date", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .post("/api/affirmations/feed/not-a-date/seen")
      .set("authorization", auth);

    expect(res.status).toBe(400);
  });
});

describe("favorites", () => {
  const todaysAffirmation = async (auth) => {
    const res = await request(app)
      .get("/api/affirmations/today")
      .set("authorization", auth);
    return res.body.entry.affirmation.id;
  };

  it("adds, lists, and removes", async () => {
    const { auth } = await registerUser(app);
    const id = await todaysAffirmation(auth);

    expect(
      (await request(app).put(`/api/affirmations/${id}/favorite`).set("authorization", auth)).status,
    ).toBe(204);

    const listed = await request(app)
      .get("/api/affirmations/favorites")
      .set("authorization", auth);
    expect(listed.body.favorites).toHaveLength(1);
    expect(listed.body.favorites[0].affirmation.id).toBe(id);

    expect(
      (await request(app).delete(`/api/affirmations/${id}/favorite`).set("authorization", auth)).status,
    ).toBe(204);

    const empty = await request(app)
      .get("/api/affirmations/favorites")
      .set("authorization", auth);
    expect(empty.body.favorites).toHaveLength(0);
  });

  it("is idempotent, so a queued offline write can be retried safely", async () => {
    const { auth } = await registerUser(app);
    const id = await todaysAffirmation(auth);

    await request(app).put(`/api/affirmations/${id}/favorite`).set("authorization", auth);
    await request(app).put(`/api/affirmations/${id}/favorite`).set("authorization", auth);
    await request(app).put(`/api/affirmations/${id}/favorite`).set("authorization", auth);

    const listed = await request(app)
      .get("/api/affirmations/favorites")
      .set("authorization", auth);
    expect(listed.body.favorites).toHaveLength(1);
  });

  it("removing something never favorited is not an error", async () => {
    const { auth } = await registerUser(app);
    const id = await todaysAffirmation(auth);

    const res = await request(app)
      .delete(`/api/affirmations/${id}/favorite`)
      .set("authorization", auth);
    expect(res.status).toBe(204);
  });

  it("404s an unknown affirmation", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .put("/api/affirmations/aaaaaaaaaaaaaaaaaaaaaaaa/favorite")
      .set("authorization", auth);

    expect(res.status).toBe(404);
  });

  it("rejects a malformed id without hitting the database", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .put("/api/affirmations/nope/favorite")
      .set("authorization", auth);

    expect(res.status).toBe(400);
  });

  it("hides another user's generated affirmation", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const owner = await User.findById(b.user.id);

    const theirs = await Affirmation.create({
      text: "I am steady in my own way.",
      categorySlug: "calm",
      source: "generated",
      user: owner._id,
    });

    const res = await request(app)
      .put(`/api/affirmations/${theirs.id}/favorite`)
      .set("authorization", a.auth);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/categories", () => {
  it("lists the active categories in order", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .get("/api/categories")
      .set("authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.categories.length).toBeGreaterThan(0);
    const orders = res.body.categories.map((c) => c.order);
    expect(orders).toEqual([...orders].sort((x, y) => x - y));
  });
});

describe("preferences", () => {
  it("returns defaults for a new user", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .get("/api/preferences")
      .set("authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.preferences.tone).toBe("grounded");
    expect(res.body.preferences.categories).toEqual([]);
  });

  it("updates tone and focus", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ tone: "gentle", focus: "being patient with myself" });

    expect(res.status).toBe(200);
    expect(res.body.preferences.tone).toBe("gentle");
    expect(res.body.preferences.focus).toBe("being patient with myself");
  });

  it("rejects an unrecognised timezone", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ timezone: "Middle/Earth" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("timezone");
  });

  it("rejects an empty patch and unknown fields", async () => {
    const { auth } = await registerUser(app);

    expect(
      (await request(app).patch("/api/preferences").set("authorization", auth).send({})).status,
    ).toBe(400);

    expect(
      (await request(app)
        .patch("/api/preferences")
        .set("authorization", auth)
        .send({ isAdmin: true })).status,
    ).toBe(400);
  });

  it("saves a theme choice", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ theme: "midnight" });

    expect(res.status).toBe(200);
    expect(res.body.preferences.theme).toBe("midnight");
  });

  it("rejects an unknown theme", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ theme: "neon-disco" });

    expect(res.status).toBe(400);
  });

  it("does not rebuild the feed for a theme-only change", async () => {
    const { auth } = await registerUser(app);

    const before = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);

    await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ theme: "dusk" });

    const after = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);

    // What it's read against doesn't change what it says.
    expect(after.body.entries.map((e) => e.affirmation.id)).toEqual(
      before.body.entries.map((e) => e.affirmation.id),
    );
  });

  it("saves the reminder window", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ reminders: { enabled: true, count: 5, start: "08:00", end: "20:00" } });

    expect(res.status).toBe(200);
    expect(res.body.preferences.reminders).toMatchObject({
      enabled: true,
      count: 5,
      start: "08:00",
      end: "20:00",
    });
  });

  it("rejects malformed reminder times", async () => {
    const { auth } = await registerUser(app);

    for (const start of ["7:30", "24:00", "nonsense"]) {
      const res = await request(app)
        .patch("/api/preferences")
        .set("authorization", auth)
        .send({ reminders: { enabled: true, count: 3, start, end: "22:00" } });
      expect(res.status, start).toBe(400);
    }
  });

  it("rejects a window that does not run forwards", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ reminders: { enabled: true, count: 3, start: "22:00", end: "09:00" } });

    expect(res.status).toBe(400);
  });

  it("caps how many reminders a day can be set", async () => {
    const { auth } = await registerUser(app);

    const res = await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ reminders: { enabled: true, count: 21, start: "09:00", end: "22:00" } });

    expect(res.status).toBe(400);
  });

  it("does not rebuild the feed for a reminder-only change", async () => {
    const { auth } = await registerUser(app);

    const before = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);

    await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ reminders: { enabled: true, count: 1, start: "08:00", end: "20:00" } });

    const after = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);

    // When affirmations are shown doesn't change what they say.
    expect(after.body.entries.map((e) => e.affirmation.id)).toEqual(
      before.body.entries.map((e) => e.affirmation.id),
    );
  });

  it("rebuilds future days against the new categories but leaves today alone", async () => {
    const { auth } = await registerUser(app);

    const before = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);
    const todayBefore = before.body.entries[0].affirmation.id;

    await request(app)
      .patch("/api/preferences")
      .set("authorization", auth)
      .send({ categories: ["calm"] });

    const after = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);

    expect(after.body.entries[0].affirmation.id).toBe(todayBefore);
    for (const entry of after.body.entries.slice(1)) {
      expect(entry.affirmation.categorySlug).toBe("calm");
    }
  });
});
