import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { COUNTED_FIELDS } from "../src/config/profileFields.js";

const app = createApp();

beforeEach(async () => {
  await seed();
});

const auth = (h) => ({ authorization: h });

describe("GET /api/profile", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/profile")).status).toBe(401);
  });

  it("returns an empty profile with a zero-ish completeness for a new user", async () => {
    const { auth: h } = await registerUser(app);

    const res = await request(app).get("/api/profile").set(auth(h));

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({});
    expect(res.body.completeness.percent).toBe(0);
    expect(res.body.completeness.total).toBeGreaterThan(0);
  });

  it("suggests non-sensitive questions before sensitive ones", async () => {
    const { auth: h } = await registerUser(app);

    const res = await request(app).get("/api/profile").set(auth(h));

    expect(res.body.suggestions.length).toBeGreaterThan(0);
    // The very first nudge is never a sensitive field (faith, mood, …).
    expect(res.body.suggestions[0].sensitive).toBe(false);
  });
});

describe("PATCH /api/profile", () => {
  it("sets a single-choice field and raises completeness", async () => {
    const { auth: h } = await registerUser(app);

    const res = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ ageBand: "25-34" });

    expect(res.status).toBe(200);
    expect(res.body.profile.ageBand).toBe("25-34");
    expect(res.body.completeness.percent).toBeGreaterThan(0);
  });

  it("accepts and dedupes a multi-choice field", async () => {
    const { auth: h } = await registerUser(app);

    const res = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ feelingCauses: ["work", "health", "work"] });

    expect(res.status).toBe(200);
    expect(res.body.profile.feelingCauses.sort()).toEqual(["health", "work"]);
  });

  it("accepts a numeric field from its option set", async () => {
    const { auth: h } = await registerUser(app);

    const ok = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ dailyGoalMinutes: 3 });
    expect(ok.status).toBe(200);
    expect(ok.body.profile.dailyGoalMinutes).toBe(3);

    const bad = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ dailyGoalMinutes: 5 });
    expect(bad.status).toBe(400);
  });

  it("rejects an option outside the allowed set", async () => {
    const { auth: h } = await registerUser(app);

    const res = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ ageBand: "twelve" });

    expect(res.status).toBe(400);
  });

  it("rejects unknown fields (strict)", async () => {
    const { auth: h } = await registerUser(app);

    const res = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ favouriteColour: "coral" });

    expect(res.status).toBe(400);
  });

  it("rejects an empty patch", async () => {
    const { auth: h } = await registerUser(app);

    const res = await request(app).patch("/api/profile").set(auth(h)).send({});
    expect(res.status).toBe(400);
  });

  it("clears a field when set to null", async () => {
    const { auth: h } = await registerUser(app);

    await request(app).patch("/api/profile").set(auth(h)).send({ zodiac: "leo" });

    const cleared = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ zodiac: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.profile.zodiac).toBeUndefined();
  });

  it("persists across requests", async () => {
    const { auth: h } = await registerUser(app);

    await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ employmentStatus: "working", zodiac: "aries" });

    const res = await request(app).get("/api/profile").set(auth(h));
    expect(res.body.profile.employmentStatus).toBe("working");
    expect(res.body.profile.zodiac).toBe("aries");
  });

  it("drops answered questions from the suggestions", async () => {
    const { auth: h } = await registerUser(app);

    const before = await request(app).get("/api/profile").set(auth(h));
    const firstKey = before.body.suggestions[0].key;

    // Answer that suggestion with its first option.
    const field = COUNTED_FIELDS.find((f) => f.key === firstKey);
    const value =
      field.kind === "text"
        ? "something true"
        : field.kind === "multi"
          ? [field.options[0]]
          : field.options[0];

    const after = await request(app)
      .patch("/api/profile")
      .set(auth(h))
      .send({ [firstKey]: value });

    expect(after.body.suggestions.map((s) => s.key)).not.toContain(firstKey);
  });

  it("reaches 100% when every counted signal is filled", async () => {
    const { auth: h } = await registerUser(app);

    // Core signals live on preferences.
    await request(app)
      .patch("/api/preferences")
      .set(auth(h))
      .send({ categories: ["calm"], focus: "being kinder to myself" });

    const patch = {};
    for (const f of COUNTED_FIELDS) {
      if (f.kind === "text") patch[f.key] = "something true";
      else if (f.kind === "multi") patch[f.key] = [f.options[0]];
      else patch[f.key] = f.options[0];
    }
    const res = await request(app).patch("/api/profile").set(auth(h)).send(patch);

    expect(res.body.completeness.percent).toBe(100);
    expect(res.body.suggestions).toHaveLength(0);
  });
});
