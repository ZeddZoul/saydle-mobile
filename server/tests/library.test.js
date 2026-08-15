import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser, entitle } from "./helpers.js";
import { flushRefills, refill } from "../src/services/library.service.js";
import { flushReplenish } from "../src/services/affirmation.service.js";
import { User } from "../src/models/User.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { Saved } from "../src/models/Saved.js";
import { Favorite } from "../src/models/Favorite.js";

const generateAffirmations = vi.fn();

vi.mock("../src/services/vertex.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generateAffirmations: (...args) => generateAffirmations(...args) };
});

vi.mock("../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    env: { ...actual.env, AI_ENABLED: true, GOOGLE_CLOUD_PROJECT: "test-project" },
  };
});

const app = createApp();

const lines = (n, prefix = "line") =>
  Array.from({ length: n }, (_, i) => ({
    text: `I can hold ${prefix} ${i}.`,
    category: "calm",
  }));

/**
 * The daily replenish and the library both call the model, and both insert into
 * `affirmations`, which is unique on (user, textKey). A mock that returns the
 * same sentences to both makes the second insert collide and land nothing — so
 * every call gets its own vocabulary, exactly as a real model would.
 */
let call = 0;
const distinctPerCall = ({ count }) => Promise.resolve(lines(count, `c${(call += 1)}`));

/** Calls that asked for a library-sized batch, ignoring the daily top-ups. */
const libraryCalls = (size) =>
  generateAffirmations.mock.calls.filter(([args]) => args.count === size);

let auth;
let user;

/** Premium, because the library is premium — see config/library.js. */
async function premiumAccount(email) {
  const registered = await registerUser(app, { email });
  const account = await User.findById(registered.user.id);
  await entitle(account);
  return { auth: registered.auth, user: account, id: registered.user.id };
}

beforeEach(async () => {
  await seed();
  call = 0;
  generateAffirmations.mockReset();
  generateAffirmations.mockResolvedValue([]);

  const account = await premiumAccount("library@example.com");
  // Registration warms the *daily* pool in the background. Settle it before
  // resetting, or its call lands on the next test's books.
  await Promise.all([flushReplenish(), flushRefills()]);
  generateAffirmations.mockReset();
  generateAffirmations.mockImplementation(distinctPerCall);

  auth = account.auth;
  user = account.user;
});

/**
 * What premium buys is whose words are in the feed, not access to it.
 *
 * A free reader scrolls the curated bank — human-written, shared, costing
 * nothing per head. A subscriber reads a batch generated for them alone. The
 * paywall sits between those two, not between the reader and the app.
 */
describe("the paywall", () => {
  it("gives a free reader the curated bank rather than a locked door", async () => {
    const free = await registerUser(app, { email: "free@example.com" });

    const res = await request(app).get("/api/library").set("authorization", free.auth);

    expect(res.status).toBe(200);
    expect(res.body.affirmations.length).toBeGreaterThan(0);
  });

  it("gives a free reader nothing that was written for anyone", async () => {
    const free = await registerUser(app, { email: "free3@example.com" });

    const res = await request(app).get("/api/library").set("authorization", free.auth);

    const ids = res.body.affirmations.map((a) => a.id);
    const rows = await Affirmation.find({ _id: { $in: ids } }).lean();

    // Curated rows belong to nobody. A generated line reaching a free feed
    // would be a personalised affirmation handed out unpaid.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.source === "curated" && r.user === null)).toBe(true);
  });

  it("lets a premium reader in", async () => {
    const res = await request(app).get("/api/library").set("authorization", auth);
    expect(res.status).toBe(200);
  });

  it("gates saving too, not just reading", async () => {
    const free = await registerUser(app, { email: "free2@example.com" });
    const any = await Affirmation.findOne({ user: null });

    const res = await request(app)
      .put(`/api/library/${any._id}/save`)
      .set("authorization", free.auth);

    // A paywall on the read and not the write is not a paywall.
    expect(res.status).toBe(403);
  });
});

describe("the batch", () => {
  it("writes one big batch rather than many small ones", async () => {
    await refill(user, { size: 240 });

    // One call, because the prompt and the thinking budget are paid per call:
    // 240 in one is 2.7x cheaper per line than six batches of forty.
    expect(libraryCalls(240)).toHaveLength(1);
    expect(await Affirmation.countDocuments({ user: user._id, library: true })).toBe(240);
  });

  it("serves a page and reports what is left", async () => {
    await refill(user, { size: 240 });

    const res = await request(app).get("/api/library?limit=40").set("authorization", auth);

    expect(res.body.affirmations).toHaveLength(40);
    expect(res.body.total).toBe(240);
    expect(res.body.remaining).toBe(240);
  });

  it("hands the app an id, and nothing that belongs to us", async () => {
    await refill(user, { size: 10 });

    const res = await request(app).get("/api/library?limit=1").set("authorization", auth);
    const line = res.body.affirmations[0];

    // `.lean()` skips the model's toJSON, so `id` has to be derived by hand —
    // and without that the app keys a list on undefined and favourites a line
    // by sending `undefined` as its id.
    expect(line.id).toEqual(expect.any(String));
    // The same transform deletes these. Shipping the owner's id to the client
    // is the part that matters.
    for (const leak of ["user", "textKey", "__v", "_id"]) {
      expect(line).not.toHaveProperty(leak);
    }
  });

  it("tracks where they are with a single number, not a row per line", async () => {
    await refill(user, { size: 240 });

    await request(app)
      .post("/api/library/seen")
      .set("authorization", auth)
      .send({ cursor: 60 });

    const page = await request(app).get("/api/library?limit=5").set("authorization", auth);
    expect(page.body.cursor).toBe(60);
    expect(page.body.remaining).toBe(180);
    // The 61st line of the batch, not the first — "new to them" is a position.
    const batch = await Affirmation.find({ user: user._id, library: true })
      .sort({ _id: 1 })
      .lean();
    expect(page.body.affirmations[0].text).toBe(batch[60].text);
  });

  it("never moves the cursor backwards", async () => {
    await refill(user, { size: 240 });

    await request(app)
      .post("/api/library/seen")
      .set("authorization", auth)
      .send({ cursor: 100 });
    await request(app)
      .post("/api/library/seen")
      .set("authorization", auth)
      .send({ cursor: 20 });

    // Scrolling back up must not un-read what they were already shown, or the
    // next batch repeats it.
    const page = await request(app).get("/api/library").set("authorization", auth);
    expect(page.body.cursor).toBe(100);
  });
});

describe("refilling", () => {
  it("refills when the unread tail runs low", async () => {
    await refill(user, { size: 50 });
    generateAffirmations.mockClear();

    // Past the refill threshold with only a handful left.
    await request(app)
      .post("/api/library/seen")
      .set("authorization", auth)
      .send({ cursor: 45 });
    await flushRefills();

    expect(libraryCalls(240).length + libraryCalls(50).length).toBeGreaterThan(0);
  });

  it("does not refill a reader who has barely started", async () => {
    await refill(user, { size: 240 });
    generateAffirmations.mockClear();

    await request(app)
      .post("/api/library/seen")
      .set("authorization", auth)
      .send({ cursor: 10 });
    await flushRefills();

    // Consumption is the trigger, not the calendar.
    expect(libraryCalls(240)).toHaveLength(0);
  });

  it("keeps what they kept and drops what they did not", async () => {
    await refill(user, { size: 50 });

    const batch = await Affirmation.find({ user: user._id, library: true }).sort({ _id: 1 });
    const hearted = batch[0];
    const bookmarked = batch[1];

    await Favorite.create({ user: user._id, affirmation: hearted._id });
    await Saved.create({ user: user._id, affirmation: bookmarked._id });

    await refill(await User.findById(user._id), { size: 50 });

    // The two they kept survive; the other forty-eight are gone rather than
    // accumulating at 240 a refill forever.
    expect(await Affirmation.findById(hearted._id)).toBeTruthy();
    expect(await Affirmation.findById(bookmarked._id)).toBeTruthy();
    expect(await Affirmation.countDocuments({ user: user._id })).toBe(52);

    // ...but they are no longer part of the scroll.
    expect(await Affirmation.countDocuments({ user: user._id, library: true })).toBe(50);
  });

  it("leaves the existing batch alone when the model is down", async () => {
    await refill(user, { size: 40 });

    const { AiUnavailableError } = await import("../src/services/vertex.service.js");
    generateAffirmations.mockRejectedValue(new AiUnavailableError("outage"));
    await refill(await User.findById(user._id), { size: 40 });

    // Losing new lines must never cost them the ones they already had.
    expect(await Affirmation.countDocuments({ user: user._id, library: true })).toBe(40);
  });

  it("lets only one instance generate at a time", async () => {
    generateAffirmations.mockImplementation(
      ({ count }) =>
        new Promise((r) => setTimeout(() => r(lines(count, `c${(call += 1)}`)), 30)),
    );

    const fresh = await User.findById(user._id);
    const [a, b] = await Promise.all([
      refill(fresh, { size: 40 }),
      refill(fresh, { size: 40 }),
    ]);

    expect(libraryCalls(40)).toHaveLength(1);
    expect([a.written, b.written].sort()).toEqual([0, 40]);
  });
});

describe("bookmarks", () => {
  it("are separate from hearts", async () => {
    await refill(user, { size: 10 });
    const one = await Affirmation.findOne({ user: user._id, library: true });

    await request(app)
      .put(`/api/library/${one._id}/save`)
      .set("authorization", auth)
      .expect(204);

    const saved = await request(app).get("/api/library/saved").set("authorization", auth);
    expect(saved.body.saved).toHaveLength(1);

    // A heart is a reaction, a bookmark is an intention. Saving one must not
    // silently favourite it.
    expect(await Favorite.countDocuments({ user: user._id })).toBe(0);
  });

  it("can be saved twice without complaint", async () => {
    await refill(user, { size: 10 });
    const one = await Affirmation.findOne({ user: user._id, library: true });

    await request(app)
      .put(`/api/library/${one._id}/save`)
      .set("authorization", auth)
      .expect(204);
    await request(app)
      .put(`/api/library/${one._id}/save`)
      .set("authorization", auth)
      .expect(204);

    expect(await Saved.countDocuments({ user: user._id })).toBe(1);
  });

  it("can be undone", async () => {
    await refill(user, { size: 10 });
    const one = await Affirmation.findOne({ user: user._id, library: true });

    await request(app).put(`/api/library/${one._id}/save`).set("authorization", auth);
    await request(app)
      .delete(`/api/library/${one._id}/save`)
      .set("authorization", auth)
      .expect(204);

    expect(await Saved.countDocuments({ user: user._id })).toBe(0);
  });
});

describe("the daily line is left alone", () => {
  it("does not appear in the daily feed", async () => {
    await refill(user, { size: 240 });

    const feed = await request(app)
      .get("/api/affirmations/feed?days=5")
      .set("authorization", auth);

    // The library is a room next to the ritual, not a replacement for it: a
    // scheduled day must never be filled from the scroll.
    const libraryTexts = new Set(
      (await Affirmation.find({ user: user._id, library: true }, { text: 1 }).lean()).map(
        (a) => a.text,
      ),
    );
    const feedTexts = feed.body.entries.map((e) => e.affirmation.text);

    expect(feedTexts.some((t) => libraryTexts.has(t))).toBe(false);
  });
});
