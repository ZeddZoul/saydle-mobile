import { describe, it, expect, beforeEach } from "vitest";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mongoose from "mongoose";
import "../src/models/User.js";
import "../src/models/RefreshToken.js";
import "../src/models/EmailVerificationToken.js";
import "../src/models/PasswordResetToken.js";
import "../src/models/Category.js";
import "../src/models/Affirmation.js";
import "../src/models/FeedEntry.js";
import "../src/models/Favorite.js";
import "../src/models/Saved.js";
import "../src/models/Tombstone.js";
import "../src/models/VoiceClip.js";

/**
 * The migrations, run the way run.js runs them, against a database with no
 * indexes at all — which is what a production database looks like, since
 * `autoIndex` is off there and nothing else builds them.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function migrationFiles() {
  return (await readdir(dir)).filter((f) => /^\d{3}-.+\.js$/.test(f)).sort();
}

async function dropEveryIndex() {
  const db = mongoose.connection.db;
  for (const { name } of await db.listCollections().toArray()) {
    if (name.startsWith("_")) continue;
    await db.collection(name).dropIndexes();
  }
}

/** Runs every migration in order, exactly as run.js does. */
async function runAll() {
  const db = mongoose.connection.db;
  for (const file of await migrationFiles()) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    await mod.up(db);
  }
}

beforeEach(async () => {
  // Every model has a collection, so a dropIndexes reaches all of them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.createCollection()));
  await dropEveryIndex();
});

describe("the migrations", () => {
  it("include the index sync, after the hand-written ones", async () => {
    const files = await migrationFiles();
    expect(files).toContain("003-sync-model-indexes.js");
    expect(files.indexOf("003-sync-model-indexes.js")).toBeGreaterThan(
      files.indexOf("002-affirmation-indexes.js"),
    );
  });

  it("leave every model's declared indexes in place, and nothing extra", async () => {
    await runAll();

    // diffIndexes is what syncIndexes would do next: anything to create means
    // a declared index the migrations did not build, anything to drop means
    // 001/002 built something the models no longer declare — which the sync
    // migration would then silently remove in production.
    for (const model of Object.values(mongoose.models)) {
      const { toCreate, toDrop } = await model.diffIndexes();
      expect(toCreate, `${model.modelName} missing`).toEqual([]);
      expect(toDrop, `${model.modelName} stray`).toEqual([]);
    }
  });

  it("build the indexes the code relies on for correctness", async () => {
    await runAll();
    const db = mongoose.connection.db;
    const names = async (c) => (await db.collection(c).indexes()).map((i) => i.name);

    // One account per address; one bookmark per line; a reset code that
    // expires on its own; a private clip found by its owner.
    expect(await names("users")).toContain("email_1");
    expect(await names("saveds")).toContain("user_1_affirmation_1");
    expect(await names("passwordresettokens")).toContain("expiresAt_1");
    expect(await names("voiceclips")).toContain("user_1");
  });

  it("can be run twice", async () => {
    await runAll();
    await expect(runAll()).resolves.toBeUndefined();
  });
});
