import { connectDb, disconnectDb } from "../src/config/db.js";
import { logger } from "../src/lib/logger.js";
import { Category } from "../src/models/Category.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { CATEGORIES, CURATED_AFFIRMATIONS } from "../src/data/curated.js";

/**
 * Idempotent: upserts by natural key, so running it twice changes nothing and
 * running it after adding lines to curated.js adds only the new ones.
 */
export async function seed() {
  await Category.bulkWrite(
    CATEGORIES.map((c) => ({
      updateOne: {
        filter: { slug: c.slug },
        update: { $set: c },
        upsert: true,
      },
    })),
  );

  await Affirmation.bulkWrite(
    CURATED_AFFIRMATIONS.map(({ text, categorySlug, locale }) => ({
      updateOne: {
        filter: { user: null, textKey: text.toLowerCase() },
        update: {
          $set: {
            text,
            textKey: text.toLowerCase(),
            categorySlug,
            locale,
            source: "curated",
            user: null,
          },
        },
        upsert: true,
      },
    })),
  );

  return {
    categories: await Category.countDocuments(),
    curated: await Affirmation.countDocuments({ source: "curated" }),
  };
}

// Only runs when invoked directly (`pnpm seed`), not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await connectDb();
    const counts = await seed();
    logger.info(counts, "seed complete");
    await disconnectDb();
  } catch (err) {
    logger.fatal({ err }, "seed failed");
    await disconnectDb().catch(() => {});
    process.exit(1);
  }
}
