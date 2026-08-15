/**
 * Baseline indexes for the auth collections.
 *
 * `autoIndex` is off in production (see src/config/db.js), so index creation is
 * explicit and reviewable. createIndex is idempotent for identical specs.
 */
export async function up(db) {
  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  await db.collection("refreshtokens").createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection("refreshtokens").createIndex({ user: 1 });
  await db.collection("refreshtokens").createIndex({ family: 1 });
  await db.collection("refreshtokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
