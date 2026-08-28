import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDb, disconnectDb } from "../src/config/db.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
  // Unique indexes are what enforce "one account per email" — build them before
  // any test relies on that, rather than racing Mongoose's background indexing.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDb();
  await mongod?.stop();
});
