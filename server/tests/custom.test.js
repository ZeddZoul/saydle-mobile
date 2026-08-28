import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser, entitle } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { FeedEntry } from "../src/models/FeedEntry.js";

const app = createApp();

let auth;
let user;

beforeEach(async () => {
  await seed();
  const registered = await registerUser(app, { email: "custom@example.com" });
  auth = registered.auth;
  user = await User.findById(registered.user.id);
});

describe("POST /api/affirmations/custom", () => {
  it("refuses without premium", async () => {
    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "I can begin again on a Tuesday." });

    expect(res.status).toBe(403);
    expect(await Affirmation.countDocuments({ source: "custom" })).toBe(0);
  });

  it("saves the reader's own words once they're entitled", async () => {
    await entitle(user);

    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "I can begin again on a Tuesday." });

    expect(res.status).toBe(201);
    expect(res.body.affirmation.text).toBe("I can begin again on a Tuesday.");
    expect(res.body.affirmation.source).toBe("custom");
  });

  it("does not hold their sentence to our style rules", async () => {
    await entitle(user);

    // No first person, an exclamation, and past our generated length cap — all
    // of which a generated line would be rejected for. This is their voice.
    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "Keep going. The garden took three years and it came back!" });

    expect(res.status).toBe(201);
  });

  it("declines crisis language, kindly and with a reason", async () => {
    await entitle(user);

    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "I deserve the self-harm I do to myself" });

    // Something written in a bad hour should not be scheduled to resurface
    // every morning, or land on a lock screen.
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/talk to someone/i);
  });

  it("rejects an empty or overlong sentence", async () => {
    await entitle(user);

    for (const text of ["", "  ", "x".repeat(201)]) {
      const res = await request(app)
        .post("/api/affirmations/custom")
        .set("Authorization", auth)
        .send({ text });

      expect(res.status).toBe(400);
    }
  });

  it("refuses a duplicate rather than storing it twice", async () => {
    await entitle(user);
    const text = "I can begin again on a Tuesday.";

    await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text });
    const again = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text });

    expect(again.status).toBe(409);
  });

  it("schedules their own words into the days ahead", async () => {
    await entitle(user);
    await request(app).get("/api/affirmations/feed?days=14").set("Authorization", auth);

    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "I can begin again on a Tuesday." });

    // Rebuilt, so their line appears tomorrow rather than after the existing
    // buffer runs out weeks from now.
    const scheduled = await FeedEntry.countDocuments({
      user: user._id,
      affirmation: res.body.affirmation.id,
    });
    expect(scheduled).toBeGreaterThan(0);
  });

  it("stores it in the reader's own language", async () => {
    await entitle(user);
    user.locale = "es";
    await user.save();

    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "Puedo empezar de nuevo un martes." });

    const saved = await Affirmation.findById(res.body.affirmation.id);
    expect(saved.locale).toBe("es");
  });

  it("requires a session", async () => {
    await request(app)
      .post("/api/affirmations/custom")
      .send({ text: "Anything at all." })
      .expect(401);
  });
});

describe("GET /api/affirmations/custom", () => {
  it("lists only the reader's own writing, newest first", async () => {
    await entitle(user);

    for (const text of ["First one written.", "Second one written."]) {
      await request(app)
        .post("/api/affirmations/custom")
        .set("Authorization", auth)
        .send({ text });
    }

    const res = await request(app).get("/api/affirmations/custom").set("Authorization", auth);

    expect(res.body.affirmations.map((a) => a.text)).toEqual([
      "Second one written.",
      "First one written.",
    ]);
    expect(res.body.affirmations.every((a) => a.source === "custom")).toBe(true);
  });

  it("never shows one reader another's writing", async () => {
    await entitle(user);
    await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "Mine alone." });

    const other = await registerUser(app, { email: "other@example.com" });
    const res = await request(app)
      .get("/api/affirmations/custom")
      .set("Authorization", other.auth);

    expect(res.body.affirmations).toEqual([]);
  });
});

describe("DELETE /api/affirmations/custom/:id", () => {
  it("removes it and clears it from the days not yet read", async () => {
    await entitle(user);
    const created = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "I can begin again on a Tuesday." });

    const id = created.body.affirmation.id;

    await request(app)
      .delete(`/api/affirmations/custom/${id}`)
      .set("Authorization", auth)
      .expect(204);

    expect(await Affirmation.findById(id)).toBeNull();
    expect(
      await FeedEntry.countDocuments({ user: user._id, affirmation: id, seenAt: null }),
    ).toBe(0);
  });

  it("cannot delete somebody else's", async () => {
    await entitle(user);
    const created = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "Mine alone." });

    const other = await registerUser(app, { email: "thief@example.com" });
    const res = await request(app)
      .delete(`/api/affirmations/custom/${created.body.affirmation.id}`)
      .set("Authorization", other.auth);

    expect(res.status).toBe(404);
    expect(await Affirmation.findById(created.body.affirmation.id)).not.toBeNull();
  });

  it("404s on something that was never there", async () => {
    await entitle(user);
    await request(app)
      .delete("/api/affirmations/custom/507f1f77bcf86cd799439011")
      .set("Authorization", auth)
      .expect(404);
  });
});

describe("the boundary around my words", () => {
  it("turns a crisis-adjacent line away at the door, kindly", async () => {
    const { registerUser } = await import("./helpers.js");
    const { User } = await import("../src/models/User.js");
    const request = (await import("supertest")).default;
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const { auth, user } = await registerUser(app, { email: "door@example.com" });
    const account = await User.findById(user.id);
    await entitle(account);

    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("authorization", auth)
      // Violence toward others, not self-harm: the original patterns only knew
      // "kill myself", and this exact sentence walked through onto a widget.
      .send({ text: "I can kill as much as I want" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/talk to someone/i);
  });

  it("never schedules one that got in before the screen knew its shape", async () => {
    const { registerUser } = await import("./helpers.js");
    const { ensureFeed, getFeed } = await import("../src/services/affirmation.service.js");
    const { User } = await import("../src/models/User.js");
    const { Affirmation } = await import("../src/models/Affirmation.js");
    const request = (await import("supertest")).default;
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const { auth, user } = await registerUser(app, { email: "legacy@example.com" });
    const account = await User.findById(user.id);
    await entitle(account);

    // A row created before the violence patterns existed — inserted directly,
    // because the API (correctly) refuses it now. Patterns will keep widening;
    // rows stored under yesterday's rules must still never reach the widget.
    await Affirmation.create({
      text: "I can kill as much as I want",
      textKey: "i can kill as much as i want",
      categorySlug: "general",
      source: "custom",
      user: account._id,
      locale: "en",
    });
    await request(app)
      .post("/api/affirmations/custom")
      .set("authorization", auth)
      .send({ text: "I show up for my morning run" })
      .expect(201);

    const fresh = await User.findById(user.id);
    await ensureFeed(fresh, { days: 14 });
    const texts = (await getFeed(fresh, { days: 14 })).map((e) => e.affirmation?.text);

    expect(texts).not.toContain("I can kill as much as I want");
    // The feature survives the safety net: benign words still join the days.
    expect(texts).toContain("I show up for my morning run");

    // And the legacy line is still theirs, untouched, in the private list.
    const mine = await request(app).get("/api/affirmations/custom").set("authorization", auth);
    expect(mine.body.affirmations.map((a) => a.text)).toContain("I can kill as much as I want");
  });
});
