import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import {
  purgeAccount,
  purgeDueAccounts,
  purgeOrphans,
  hashEmail,
} from "../src/services/purge.service.js";
import { User } from "../src/models/User.js";
import { Tombstone } from "../src/models/Tombstone.js";
import { FeedEntry } from "../src/models/FeedEntry.js";
import { Favorite } from "../src/models/Favorite.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { RefreshToken } from "../src/models/RefreshToken.js";
import { VoiceClip } from "../src/models/VoiceClip.js";
import { tombstoneKey } from "../src/config/env.js";

// Ten minutes from now: past the orphan sweep's grace window, so rows created
// a moment ago count as old enough to be judged.
const later = () => new Date(Date.now() + 10 * 60 * 1000);

const app = createApp();
const password = "correct horse battery";

/** An account with something in every collection a purge has to reach. */
async function accountWithData(email) {
  const registered = await registerUser(app, { email });
  const auth = registered.auth;

  await request(app).get("/api/affirmations/feed?days=5").set("authorization", auth);
  const today = await request(app).get("/api/affirmations/today").set("authorization", auth);
  const fav = await request(app)
    .put(`/api/affirmations/${today.body.entry.affirmation.id}/favorite`)
    .set("authorization", auth);

  // Asserted, not assumed: a helper that quietly fails to create the row makes
  // every "nothing is left behind" test below pass for the wrong reason.
  if (fav.status >= 400) throw new Error(`favorite failed: ${fav.status}`);

  return { ...registered, id: registered.user.id };
}

const schedule = (accessToken, email) =>
  request(app)
    .delete("/api/auth/me")
    .set("authorization", `Bearer ${accessToken}`)
    .send({ password, confirmEmail: email });

beforeEach(async () => {
  await seed();
});

describe("purging an account", () => {
  it("leaves nothing of theirs in any collection", async () => {
    const email = "gone@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);

    const user = await User.findById(id);
    await purgeAccount(user);

    // Walked rather than spot-checked: the failure mode is forgetting one.
    for (const model of [FeedEntry, Favorite, Affirmation, RefreshToken]) {
      expect(await model.countDocuments({ user: id })).toBe(0);
    }
    expect(await User.findById(id)).toBeNull();
  });

  it("reaches every user-scoped collection in the database", async () => {
    const email = "thorough@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);

    await purgeAccount(await User.findById(id));

    // The real assertion: ask Mongo itself what is left anywhere, so a
    // collection added later without being purged fails here rather than
    // leaking quietly. Tombstones are the one thing meant to survive.
    const collections = await mongoose.connection.db.listCollections().toArray();
    const leftovers = [];

    for (const { name } of collections) {
      if (name === "tombstones" || name.startsWith("_")) continue;
      const found = await mongoose.connection.db
        .collection(name)
        .countDocuments({ user: new mongoose.Types.ObjectId(id) });
      if (found > 0) leftovers.push(`${name}: ${found}`);
    }

    expect(leftovers).toEqual([]);
  });

  it("keeps a tombstone that cannot identify them", async () => {
    const email = "billing@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);

    const user = await User.findById(id);
    await purgeAccount(user);

    const stone = await Tombstone.findOne({ user: id }).lean();
    expect(stone).toBeTruthy();
    expect(stone.emailHash).toBe(hashEmail(email));
    expect(stone.subscription.status).toBeTruthy();
    // Keyed on the dedicated tombstone key, so rotating an auth secret cannot
    // orphan every tombstone written before it.
    expect(stone.emailHash).toBe(
      crypto.createHmac("sha256", tombstoneKey).update(email).digest("hex"),
    );

    // The point of the whole exercise: nothing here says who they were.
    const text = JSON.stringify(stone);
    expect(text).not.toContain(email);
    expect(text).not.toContain("Ada");
  });

  it("keeps the tombstone for the retention period, not forever", async () => {
    const email = "retained@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);
    await purgeAccount(await User.findById(id));

    const stone = await Tombstone.findOne({ user: id }).lean();
    const years = (stone.expiresAt - stone.purgedAt) / (365.25 * 24 * 3600 * 1000);

    expect(years).toBeGreaterThan(5.9);
    expect(years).toBeLessThan(6.1);
  });

  it("removes their own clips and leaves the shared ones", async () => {
    const email = "spoken@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);

    const audio = Buffer.from("mp3");
    await VoiceClip.create([
      {
        key: "shared-1",
        voiceId: "v",
        text: "shared",
        audio,
        bytes: 3,
        characters: 6,
        user: null,
        renderedFor: id,
      },
      { key: "mine-1", voiceId: "v", text: "mine", audio, bytes: 3, characters: 4, user: id },
    ]);

    await purgeAccount(await User.findById(id));

    // Their own words go with them. A curated line they happened to be the
    // first to play belongs to the line, not to them — only the record of who
    // paid for that render is cleared.
    expect(await VoiceClip.countDocuments({ user: id })).toBe(0);
    const shared = await VoiceClip.findOne({ key: "shared-1" }).lean();
    expect(shared).toBeTruthy();
    expect(shared.renderedFor).toBeNull();
  });

  it("can be run twice without failing", async () => {
    const email = "retry@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);

    const user = await User.findById(id);
    await purgeAccount(user);
    // A process killed mid-purge is retried, and the retry must finish the job
    // rather than fall over on what it already did.
    await expect(purgeAccount(user)).resolves.toBeTruthy();

    expect(await Tombstone.countDocuments({ user: id })).toBe(1);
  });
});

describe("the scheduled sweep", () => {
  it("takes accounts whose grace period has run out", async () => {
    const email = "due@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);

    // Wind the clock past the window rather than waiting thirty days.
    await User.updateOne(
      { _id: id },
      { $set: { "deletion.purgeAfter": new Date(Date.now() - 1000) } },
    );

    const { purged } = await purgeDueAccounts();

    expect(purged).toContain(String(id));
    expect(await User.findById(id)).toBeNull();
  });

  it("leaves an account that is still inside its window", async () => {
    const email = "waiting@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);

    const { purged } = await purgeDueAccounts();

    expect(purged).toEqual([]);
    expect(await User.findById(id)).toBeTruthy();
  });

  it("never touches an account that asked to stay", async () => {
    const { id } = await accountWithData("staying@example.com");

    await purgeDueAccounts();

    expect(await User.findById(id)).toBeTruthy();
  });

  it("hands an account back if purging it throws", async () => {
    const email = "unlucky@example.com";
    const { id, accessToken } = await accountWithData(email);
    await schedule(accessToken, email);
    const due = new Date(Date.now() - 1000);
    await User.updateOne({ _id: id }, { $set: { "deletion.purgeAfter": due } });

    // A tombstone already claiming this id makes the write fail on its unique
    // index — the closest thing to a mid-purge crash we can stage.
    const original = Tombstone.updateOne;
    Tombstone.updateOne = () => Promise.reject(new Error("storage is down"));

    await expect(purgeDueAccounts()).rejects.toThrow("storage is down");
    Tombstone.updateOne = original;

    // Rescheduled, not silently dropped: an account left with no date would
    // never be purged and nobody would ever find out.
    const after = await User.findById(id);
    expect(after.deletion.purgeAfter.getTime()).toBe(due.getTime());
  });
});

describe("the backlog left by the old delete", () => {
  it("removes rows whose owner no longer exists", async () => {
    const { id } = await accountWithData("orphan@example.com");

    // Exactly what the previous implementation did: drop the user row and
    // nothing else.
    await User.deleteOne({ _id: id });
    expect(await FeedEntry.countDocuments({ user: id })).toBeGreaterThan(0);

    await purgeOrphans({ now: later() });

    expect(await FeedEntry.countDocuments({ user: id })).toBe(0);
    expect(await Affirmation.countDocuments({ user: id })).toBe(0);
  });

  it("leaves rows created after the snapshot alone", async () => {
    const { id } = await accountWithData("newcomer@example.com");

    // Stage the race: the sweep took its list of accounts, then this one
    // registered. Its rows are seconds old and its id is not in the list —
    // exactly what an orphan looks like, except that it is not one.
    await User.deleteOne({ _id: id });

    await purgeOrphans();

    expect(await RefreshToken.countDocuments({ user: id })).toBeGreaterThan(0);
    expect(await FeedEntry.countDocuments({ user: id })).toBeGreaterThan(0);

    // The next sweep, once the window has passed, takes them.
    await purgeOrphans({ now: later() });
    expect(await RefreshToken.countDocuments({ user: id })).toBe(0);
  });

  it("leaves the curated bank alone", async () => {
    const before = await Affirmation.countDocuments({ user: null });

    await purgeOrphans({ now: later() });

    // Curated rows have no owner by design; a naive "delete anything whose user
    // is missing" would wipe the shared bank every run.
    expect(await Affirmation.countDocuments({ user: null })).toBe(before);
  });
});
