import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { FeedEntry } from "../src/models/FeedEntry.js";
import { startTrial } from "../src/services/subscription.service.js";

const app = createApp();

let auth;
let user;

/** Premium is the gate; a trial is the cheapest honest way through it. */
async function entitle() {
  startTrial(user);
  await user.save();
}

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
    await entitle();

    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "I can begin again on a Tuesday." });

    expect(res.status).toBe(201);
    expect(res.body.affirmation.text).toBe("I can begin again on a Tuesday.");
    expect(res.body.affirmation.source).toBe("custom");
  });

  it("does not hold their sentence to our style rules", async () => {
    await entitle();

    // No first person, an exclamation, and past our generated length cap — all
    // of which a generated line would be rejected for. This is their voice.
    const res = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text: "Keep going. The garden took three years and it came back!" });

    expect(res.status).toBe(201);
  });

  it("declines crisis language, kindly and with a reason", async () => {
    await entitle();

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
    await entitle();

    for (const text of ["", "  ", "x".repeat(201)]) {
      const res = await request(app)
        .post("/api/affirmations/custom")
        .set("Authorization", auth)
        .send({ text });

      expect(res.status).toBe(400);
    }
  });

  it("refuses a duplicate rather than storing it twice", async () => {
    await entitle();
    const text = "I can begin again on a Tuesday.";

    await request(app).post("/api/affirmations/custom").set("Authorization", auth).send({ text });
    const again = await request(app)
      .post("/api/affirmations/custom")
      .set("Authorization", auth)
      .send({ text });

    expect(again.status).toBe(409);
  });

  it("schedules their own words into the days ahead", async () => {
    await entitle();
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
    await entitle();
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
    await entitle();

    for (const text of ["First one written.", "Second one written."]) {
      await request(app).post("/api/affirmations/custom").set("Authorization", auth).send({ text });
    }

    const res = await request(app).get("/api/affirmations/custom").set("Authorization", auth);

    expect(res.body.affirmations.map((a) => a.text)).toEqual([
      "Second one written.",
      "First one written.",
    ]);
    expect(res.body.affirmations.every((a) => a.source === "custom")).toBe(true);
  });

  it("never shows one reader another's writing", async () => {
    await entitle();
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
    await entitle();
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
    await entitle();
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
    await entitle();
    await request(app)
      .delete("/api/affirmations/custom/507f1f77bcf86cd799439011")
      .set("Authorization", auth)
      .expect(404);
  });
});
