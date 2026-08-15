import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/config/db.js";
import { logger } from "../src/lib/logger.js";

/**
 * Mongoose has no migration story, so this is ours.
 *
 * Every file matching `NNN-name.js` in this directory exports `async up(db)`.
 * Applied names are recorded in the `_migrations` collection and skipped on the
 * next run, so `pnpm migrate` is safe to run repeatedly and in CI.
 *
 * Write migrations idempotently anyway — an interrupted run leaves work done but
 * unrecorded, and the retry has to survive that.
 */
const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  await connectDb();
  const db = mongoose.connection.db;
  const ledger = db.collection("_migrations");
  await ledger.createIndex({ name: 1 }, { unique: true });

  const applied = new Set(
    (await ledger.find({}, { projection: { name: 1 } }).toArray()).map((d) => d.name),
  );

  const files = (await readdir(here)).filter((f) => /^\d{3}-.+\.js$/.test(f)).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    logger.info({ migration: file }, "applying migration");
    const mod = await import(pathToFileURL(join(here, file)).href);
    await mod.up(db);
    await ledger.insertOne({ name: file, appliedAt: new Date() });
    ran += 1;
  }

  logger.info({ ran, total: files.length }, "migrations complete");
  await disconnectDb();
}

main().catch(async (err) => {
  logger.fatal({ err }, "migration failed");
  await disconnectDb().catch(() => {});
  process.exit(1);
});
