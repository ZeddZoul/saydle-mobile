/**
 * Top the curated bank up from affirmations.dev.
 *
 * A source, never a dependency. The bank is the offline floor — what shows when
 * Vertex is down, when the phone has no signal, and on day one before the first
 * generation lands. Calling a free third-party API at read time would give the
 * fallback the same failure modes as the thing it exists to catch, so this pulls
 * once, screens the results, and writes them into our own collection.
 *
 *   pnpm --filter @saydle/server import-bank              # 100, written
 *   pnpm --filter @saydle/server import-bank --count=300
 *   pnpm --filter @saydle/server import-bank --dry        # report, write nothing
 *
 * English only: affirmations.dev has no locale, and a Spanish reader must never
 * be handed an English fallback. The Spanish bank stays hand-curated.
 */
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { filterAffirmations } from "../src/services/moderation.service.js";

const ENDPOINT = "https://www.affirmations.dev/";
const LOCALE = "en";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};

const wanted = Number(arg("count", 100));
const dry = process.argv.includes("--dry");

/**
 * One line per request — the endpoint ignores any count parameter, so volume is
 * round trips. Kept sequential with a small pause rather than hammering a free
 * service someone else pays for.
 */
async function fetchLines(count) {
  const seen = new Set();

  for (let i = 0; i < count * 3 && seen.size < count; i += 1) {
    try {
      const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const { affirmation } = await res.json();
      // The API repeats itself freely, so the set does the deduping and the
      // loop is bounded well above `count` to allow for it.
      if (affirmation) seen.add(String(affirmation).trim());
    } catch {
      /* A flaky request costs one line, not the run. */
    }

    await new Promise((r) => setTimeout(r, 60));
  }

  return [...seen];
}

await mongoose.connect(env.MONGODB_URI);

const raw = await fetchLines(wanted);

// Screened exactly like model output: the bank is read by the same people, and
// "a human wrote it somewhere else" is not a safety argument.
const { approved, rejected } = filterAffirmations(
  raw.map((text) => ({ text, category: "general" })),
  LOCALE,
);

const existing = new Set(
  (await Affirmation.find({ user: null, locale: LOCALE }, { textKey: 1 }).lean()).map(
    (a) => a.textKey,
  ),
);

const fresh = approved.filter((a) => !existing.has(a.text.trim().toLowerCase()));

const reasons = rejected.reduce((acc, r) => {
  acc[r.reason] = (acc[r.reason] ?? 0) + 1;
  return acc;
}, {});

console.log(`fetched   ${raw.length} distinct`);
console.log(`approved  ${approved.length}`);
console.log(`rejected  ${rejected.length}`, reasons);
console.log(`new       ${fresh.length} (rest already in the bank)`);

if (!dry && fresh.length > 0) {
  const docs = fresh.map((a) => ({
    text: a.text,
    textKey: a.text.trim().toLowerCase(),
    categorySlug: a.category ?? "general",
    source: "curated",
    user: null,
    locale: LOCALE,
  }));

  const inserted = await Affirmation.insertMany(docs, { ordered: false }).catch((err) => {
    if (err?.code === 11000 || err?.writeErrors) return err.insertedDocs ?? [];
    throw err;
  });

  console.log(`inserted  ${inserted.length}`);
}

console.log(`bank now  ${await Affirmation.countDocuments({ user: null, locale: LOCALE })}`);
await mongoose.disconnect();
