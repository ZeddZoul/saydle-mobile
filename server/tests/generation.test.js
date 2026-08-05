import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Affirmation } from "../src/models/Affirmation.js";

// The Vertex boundary is mocked, never called: these tests are about what we
// send it and what we do with what comes back.
const generateAffirmations = vi.fn();

vi.mock("../src/services/vertex.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateAffirmations: (...args) => generateAffirmations(...args),
  };
});

vi.mock("../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    env: { ...actual.env, AI_ENABLED: true, GOOGLE_CLOUD_PROJECT: "test-project" },
  };
});

const app = createApp();

let auth;
let user;

const batch = (texts) => texts.map((text) => ({ text, category: "calm" }));

beforeEach(async () => {
  await seed();
  generateAffirmations.mockReset();
  const registered = await registerUser(app, { email: "gen@example.com" });
  auth = registered.auth;
  user = await User.findById(registered.user.id);
});

describe("generation", () => {
  it("stores what the model returns, once moderation has passed it", async () => {
    generateAffirmations.mockResolvedValue(
      batch([
        "I can begin before I feel ready.",
        "I am allowed to rest without earning it.",
        "My worth holds steady on a slow day.",
      ]),
    );

    await request(app).get("/api/affirmations/today").set("Authorization", auth).expect(200);

    const stored = await Affirmation.find({ user: user._id, source: "generated" });
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].promptVersion).toBeGreaterThan(0);
  });

  it("drops a line that fails moderation without losing the batch", async () => {
    generateAffirmations.mockResolvedValue(
      batch([
        "I can begin before I feel ready.",
        // Second person: a prompt is a request, not a guarantee.
        "You are enough exactly as you are.",
      ]),
    );

    await request(app).get("/api/affirmations/today").set("Authorization", auth).expect(200);

    const texts = (await Affirmation.find({ user: user._id, source: "generated" })).map(
      (a) => a.text,
    );
    expect(texts).toContain("I can begin before I feel ready.");
    expect(texts).not.toContain("You are enough exactly as you are.");
  });

  it("falls back to the curated bank when the model is unavailable", async () => {
    const { AiUnavailableError } = await import("../src/services/vertex.service.js");
    generateAffirmations.mockRejectedValue(new AiUnavailableError("outage"));

    const res = await request(app)
      .get("/api/affirmations/today")
      .set("Authorization", auth);

    // An outage must never mean opening the app to nothing.
    expect(res.status).toBe(200);
    expect(res.body.entry.affirmation.text).toBeTruthy();
  });

  it("passes the reader's own words through the crisis screen, not around it", async () => {
    generateAffirmations.mockResolvedValue(batch(["I can begin before I feel ready."]));

    user.profile.goal = "finish my dissertation";
    user.profile.weighing = "coping with self-harm urges";
    user.markModified("profile");
    await user.save();

    await request(app).get("/api/affirmations/today").set("Authorization", auth);

    const [args] = generateAffirmations.mock.calls[0];

    // The screen must actually arrive — threading it is the whole point, and
    // dropping it silently restores a permissive default.
    expect(typeof args.screenText).toBe("function");
    expect(args.screenText("coping with self-harm urges")).toBe(false);
    expect(args.screenText("finish my dissertation")).toBe(true);
  });

  it("softens the whole batch when free text suggests a hard time", async () => {
    generateAffirmations.mockResolvedValue(batch(["I can begin before I feel ready."]));

    user.profile.weighing = "coping with self-harm urges";
    user.markModified("profile");
    await user.save();

    await request(app).get("/api/affirmations/today").set("Authorization", auth);

    expect(generateAffirmations.mock.calls[0][0].gentle).toBe(true);
  });

  it("screens the reader's words in their own language", async () => {
    generateAffirmations.mockResolvedValue(batch(["Puedo empezar antes de estar listo."]));

    user.locale = "es";
    user.profile.weighing = "estoy en terapia con mi terapeuta";
    user.markModified("profile");
    await user.save();

    await request(app).get("/api/affirmations/today").set("Authorization", auth);

    const [args] = generateAffirmations.mock.calls[0];
    // English patterns say nothing about Spanish text; screening without the
    // locale would wave this straight through to the model.
    expect(args.screenText("estoy en terapia con mi terapeuta")).toBe(false);
    expect(args.language).toBe("Spanish");
  });

  it("asks for more than it needs, since moderation will reject some", async () => {
    generateAffirmations.mockResolvedValue(batch(["I can begin before I feel ready."]));

    await request(app).get("/api/affirmations/feed?days=10").set("Authorization", auth);

    const { count } = generateAffirmations.mock.calls[0][0];
    expect(count).toBeGreaterThan(10);
  });

  it("never sends a stated focus that trips the crisis screen", async () => {
    generateAffirmations.mockResolvedValue(batch(["I can begin before I feel ready."]));

    await request(app)
      .patch("/api/preferences")
      .set("Authorization", auth)
      .send({ focus: "coping with self-harm urges" });

    // Routed to the curated bank entirely — we do not generate against it and
    // never echo the topic back.
    expect(generateAffirmations).not.toHaveBeenCalled();
  });
});
