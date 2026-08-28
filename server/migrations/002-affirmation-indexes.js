/**
 * Indexes for the affirmations domain.
 *
 * The two unique indexes are correctness, not performance: they are what make
 * "one affirmation per user per day" and "favouriting is idempotent" true even
 * under concurrent requests.
 */
export async function up(db) {
  await db.collection("categories").createIndex({ slug: 1 }, { unique: true });

  await db.collection("affirmations").createIndex({ user: 1, textKey: 1 }, { unique: true });
  await db.collection("affirmations").createIndex({ categorySlug: 1 });
  await db.collection("affirmations").createIndex({ source: 1 });

  await db.collection("feedentries").createIndex({ user: 1, date: 1 }, { unique: true });

  await db.collection("favorites").createIndex({ user: 1, affirmation: 1 }, { unique: true });
}
