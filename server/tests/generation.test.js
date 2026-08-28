import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import {
  flushReplenish,
  replenish,
  scheduleReplenish,
} from "../src/services/affirmation.service.js";
import { FeedEntry } from "../src/models/FeedEntry.js";
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

  // Registration warms the pool in the background now, so the account arrives
  // with a replenishment already running. Settle it and reset, or every test
  // below starts with a call it did not make on its books.
  generateAffirmations.mockReset();
  generateAffirmations.mockResolvedValue([]);
  const registered = await registerUser(app, { email: "gen@example.com" });
  await flushReplenish();
  generateAffirmations.mockReset();

  auth = registered.auth;
  user = await User.findById(registered.user.id);

  // Everything below is about *how* we generate, which only happens for a
  // paying reader — free accounts read the curated bank and cost no model time.
  // Shaped like a webhook rather than a trial, so it keeps meaning "paying"
  // once the trial is gone.
  user.subscription.status = "active";
  user.subscription.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  user.subscription.verifiedAt = new Date();
  await user.save();
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
    await flushReplenish();

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
    await flushReplenish();

    const texts = (await Affirmation.find({ user: user._id, source: "generated" })).map(
      (a) => a.text,
    );
    expect(texts).toContain("I can begin before I feel ready.");
    expect(texts).not.toContain("You are enough exactly as you are.");
  });

  it("falls back to the curated bank when the model is unavailable", async () => {
    const { AiUnavailableError } = await import("../src/services/vertex.service.js");
    generateAffirmations.mockRejectedValue(new AiUnavailableError("outage"));

    const res = await request(app).get("/api/affirmations/today").set("Authorization", auth);
    await flushReplenish();

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
    await flushReplenish();

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
    await flushReplenish();

    expect(generateAffirmations.mock.calls[0][0].gentle).toBe(true);
  });

  it("screens the reader's words in their own language", async () => {
    generateAffirmations.mockResolvedValue(batch(["Puedo empezar antes de estar listo."]));

    user.locale = "es";
    user.profile.weighing = "estoy en terapia con mi terapeuta";
    user.markModified("profile");
    await user.save();

    await request(app).get("/api/affirmations/today").set("Authorization", auth);
    await flushReplenish();

    const [args] = generateAffirmations.mock.calls[0];
    // English patterns say nothing about Spanish text; screening without the
    // locale would wave this straight through to the model.
    expect(args.screenText("estoy en terapia con mi terapeuta")).toBe(false);
    expect(args.language).toBe("Spanish");
  });

  it("asks for more than it needs, since moderation will reject some", async () => {
    generateAffirmations.mockResolvedValue(batch(["I can begin before I feel ready."]));

    await request(app).get("/api/affirmations/feed?days=10").set("Authorization", auth);
    await flushReplenish();

    const { count } = generateAffirmations.mock.calls[0][0];
    expect(count).toBeGreaterThan(10);
  });

  it("never sends a stated focus that trips the crisis screen", async () => {
    generateAffirmations.mockResolvedValue(batch(["I can begin before I feel ready."]));

    await request(app)
      .patch("/api/preferences")
      .set("Authorization", auth)
      .send({ focus: "coping with self-harm urges" });
    await flushReplenish();

    // Routed to the curated bank entirely — we do not generate against it and
    // never echo the topic back.
    expect(generateAffirmations).not.toHaveBeenCalled();
  });
});

/**
 * The cold-start contract.
 *
 * Measured before this split: a new account's first request generated a whole
 * buffer inline and took 20.2s, against a client that gives up at 15s. The work
 * landed and the reader was told the server was unreachable. These tests are
 * about the shape that makes that impossible, not about the prompt.
 */
describe("the read path never waits for the model", () => {
  it("answers a brand-new account while generation is still running", async () => {
    // The deferred is built before the mock, not inside it: replenish does
    // several database round trips before it reaches the model, so a resolver
    // assigned on call would still be undefined here and the suite would hang
    // waiting on a promise nothing could settle.
    let release;
    const pending = new Promise((resolve) => (release = resolve));
    generateAffirmations.mockImplementation(() => pending);

    const res = await request(app)
      .get("/api/affirmations/today")
      .set("Authorization", auth)
      .expect(200);

    // The model has not answered and cannot answer — and the reader still has
    // a line. This is the assertion the 20-second first screen would fail.
    expect(res.body.entry.affirmation.text).toBeTruthy();
    expect(res.body.entry.affirmation.source).toBe("curated");

    release(batch(["I can begin before I feel ready."]));
    await flushReplenish();
  });

  it("still answers when the model never answers at all", async () => {
    const { AiUnavailableError } = await import("../src/services/vertex.service.js");
    generateAffirmations.mockRejectedValue(new AiUnavailableError("outage"));

    await request(app)
      .get("/api/affirmations/feed?days=7")
      .set("Authorization", auth)
      .expect(200);

    await flushReplenish();

    // A failed background batch is a quality loss, never an outage: the days
    // are scheduled regardless.
    const scheduled = await FeedEntry.countDocuments({ user: user._id });
    expect(scheduled).toBeGreaterThanOrEqual(7);
  });

  it("hands the days ahead to the model's lines once they land", async () => {
    generateAffirmations.mockResolvedValue([]);
    await request(app).get("/api/affirmations/feed?days=6").set("Authorization", auth);
    await flushReplenish();

    const before = await FeedEntry.find({ user: user._id }).populate("affirmation");
    expect(before.every((e) => e.affirmation.source === "curated")).toBe(true);

    generateAffirmations.mockResolvedValue(
      batch([
        "I can begin before I feel ready.",
        "I am allowed to rest without earning it.",
        "My worth holds steady on a slow day.",
        "I get to choose my next small step.",
        "I let myself take up room today.",
      ]),
    );
    await replenish(user);

    const after = await FeedEntry.find({ user: user._id })
      .sort({ date: 1 })
      .populate("affirmation");

    // Today keeps the line it was opened with — swapping it under someone
    // mid-read is worse than a day of the bank.
    expect(after[0].affirmation.source).toBe("curated");
    expect(after.slice(1).some((e) => e.affirmation.source === "generated")).toBe(true);
  });

  it("never rewrites a day the reader has already seen", async () => {
    generateAffirmations.mockResolvedValue([]);
    await request(app).get("/api/affirmations/feed?days=6").set("Authorization", auth);
    await flushReplenish();

    const entries = await FeedEntry.find({ user: user._id }).sort({ date: 1 });
    const seen = entries[2];
    seen.seenAt = new Date();
    await seen.save();

    generateAffirmations.mockResolvedValue(
      batch([
        "I can begin before I feel ready.",
        "I am allowed to rest without earning it.",
        "My worth holds steady on a slow day.",
      ]),
    );
    await replenish(user);

    const after = await FeedEntry.findById(seen._id).populate("affirmation");
    expect(after.affirmation.source).toBe("curated");
  });

  it("does not start a second batch while one is running", async () => {
    let calls = 0;
    generateAffirmations.mockImplementation(() => {
      calls += 1;
      return new Promise((resolve) =>
        setTimeout(() => resolve(batch(["I can begin before I feel ready."])), 20),
      );
    });

    // Today and the feed sync land within a second of each other on every cold
    // launch; without the guard that is two full batches for one account.
    scheduleReplenish(user);
    scheduleReplenish(user);
    scheduleReplenish(user);
    await flushReplenish();

    expect(calls).toBe(1);
  });

  /**
   * These call `replenish` directly rather than `scheduleReplenish`, on purpose.
   * The in-process map would answer first and prove nothing — what is under test
   * is the claim in the database, which is the only thing a *second instance*
   * behind a load balancer can see.
   */
  describe("the claim that survives more than one instance", () => {
    it("lets exactly one of two concurrent instances generate", async () => {
      let calls = 0;
      generateAffirmations.mockImplementation(() => {
        calls += 1;
        return new Promise((resolve) =>
          setTimeout(() => resolve(batch(["I can begin before I feel ready."])), 30),
        );
      });

      // Two servers, same reader, same moment. Both see an empty pool.
      const [a, b] = await Promise.all([replenish(user), replenish(user)]);

      expect(calls).toBe(1);
      // The loser reports no work rather than failing: it simply lost the race.
      expect([a.generated, b.generated].sort()).toEqual([0, 1]);
    });

    it("releases the claim, so the next batch is not locked out", async () => {
      generateAffirmations.mockResolvedValue(batch(["I can rest and still be enough."]));
      await replenish(user);

      expect((await User.findById(user._id)).replenishingUntil).toBeNull();
    });

    it("reclaims a deadline left behind by a process that died mid-batch", async () => {
      // A crash between claim and release. A boolean flag would strand this
      // reader with no generation, forever, and nothing would report it.
      await User.updateOne(
        { _id: user._id },
        { $set: { replenishingUntil: new Date(Date.now() - 1000) } },
      );

      generateAffirmations.mockResolvedValue(batch(["I can begin again."]));
      const result = await replenish(user);

      expect(result.generated).toBeGreaterThan(0);
    });

    it("holds off while another instance's claim is still live", async () => {
      await User.updateOne(
        { _id: user._id },
        { $set: { replenishingUntil: new Date(Date.now() + 60_000) } },
      );

      generateAffirmations.mockResolvedValue(batch(["I can begin again."]));
      const result = await replenish(user);

      expect(generateAffirmations).not.toHaveBeenCalled();
      expect(result.generated).toBe(0);
    });

    it("costs no write at all when the pool is already full", async () => {
      generateAffirmations.mockResolvedValue(
        batch(Array.from({ length: 40 }, (_, i) => `I can take step ${i}.`)),
      );
      await replenish(user);

      // The claim is only worth asking for once the count says there is work:
      // every ordinary read arrives here, and none of them should write.
      const spy = vi.spyOn(User, "findOneAndUpdate");
      await replenish(user);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  it("stops spending on an account that asked to be deleted", async () => {
    generateAffirmations.mockReset();
    generateAffirmations.mockResolvedValue(batch(["I can begin again."]));

    await request(app)
      .delete("/api/auth/me")
      .set("authorization", auth)
      .send({ password: "correct horse battery", confirmEmail: "gen@example.com" })
      .expect(202);

    const pending = await User.findById(user._id);
    await scheduleReplenish(pending);
    await flushReplenish();

    // The curated bank keeps their days filled, so nothing visibly degrades —
    // and cancelling puts them back in the queue on the next read.
    expect(generateAffirmations).not.toHaveBeenCalled();
  });

  it("kicks the head start at registration, but only spends it on a payer", async () => {
    generateAffirmations.mockReset();
    generateAffirmations.mockResolvedValue(batch(["I can begin before I feel ready."]));

    const { user: created } = await registerUser(app, { email: "warm@example.com" });
    await flushReplenish();

    // Registration still calls scheduleReplenish — the account is created at the
    // end of onboarding, so there are a few seconds of paywall and navigation to
    // finish a batch in. It just declines to spend anything until they pay; the
    // only call at signup is the one-line sample, which never asks for a batch.
    const atSignup = generateAffirmations.mock.calls.map(([a]) => a.count);
    for (const c of atSignup) expect(c).toBeLessThanOrEqual(5);
    generateAffirmations.mockClear();

    const fresh = await User.findById(created.id);
    fresh.subscription.status = "active";
    fresh.subscription.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    fresh.subscription.verifiedAt = new Date();
    await fresh.save();

    await scheduleReplenish(fresh);
    await flushReplenish();

    expect(generateAffirmations).toHaveBeenCalled();
  });
});

/**
 * Generation is what premium sells, and what it costs us.
 *
 * A free reader gets the curated bank — written once, free per head. Paying a
 * model on their behalf is a bill nobody notices until it arrives, so the guard
 * lives inside `scheduleReplenish` where every path that could spend money goes
 * through it, rather than at each call site where one can forget.
 */
describe("who we spend model time on", () => {
  const entitle = async (user) => {
    // Shaped like a webhook, not a trial: this must keep meaning "paying"
    // after the trial is gone.
    user.subscription.status = "active";
    user.subscription.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    user.subscription.verifiedAt = new Date();
    await user.save();
  };

  beforeEach(() => generateAffirmations.mockReset());

  it("never generates a batch for a free account", async () => {
    await seed();
    const { user: created } = await registerUser(app, { email: "free@example.com" });
    const user = await User.findById(created.id);
    generateAffirmations.mockClear();

    await scheduleReplenish(user);
    await flushReplenish();

    // Cleared after registration on purpose: the one-off sample line is the
    // deliberate exception, and it is not what this is guarding. What must
    // never happen is a *feed* generated for someone who has not paid.
    expect(generateAffirmations).not.toHaveBeenCalled();
  });

  it("generates once they are paying", async () => {
    await seed();
    const { user: created } = await registerUser(app, { email: "paid@example.com" });
    const user = await User.findById(created.id);
    await entitle(user);

    generateAffirmations.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => `I can hold my own pace, take ${i}.`),
    );

    await scheduleReplenish(user);
    await flushReplenish();

    expect(generateAffirmations).toHaveBeenCalled();
  });

  it("spends exactly one small call on a free signup, and no batch", async () => {
    await seed();
    generateAffirmations.mockResolvedValue(["I can begin again on a Tuesday."]);

    await registerUser(app, { email: "signup@example.com" });
    await flushReplenish();

    // Registration kicks scheduleReplenish for the head start, which declines
    // until they pay — so the only call is the sample line, and it asks for a
    // handful rather than a batch. If this ever grows, someone has put a feed
    // behind a free signup.
    const counts = generateAffirmations.mock.calls.map(([a]) => a.count);
    expect(counts.length).toBeLessThanOrEqual(1);
    for (const c of counts) expect(c).toBeLessThanOrEqual(5);
  });
});
