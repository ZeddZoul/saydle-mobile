import mongoose from "mongoose";
import { env, isProduction } from "./env.js";
import { logger } from "../lib/logger.js";

mongoose.set("strictQuery", true);

// Mongoose buffers queries when disconnected, which turns "the database is down"
// into "this request hangs". Fail fast instead.
mongoose.set("bufferCommands", false);

export async function connectDb(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: !isProduction, // build indexes explicitly in prod, via migrations
  });
  logger.info({ host: mongoose.connection.host }, "mongo connected");
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

mongoose.connection.on("error", (err) => {
  logger.error({ err }, "mongo connection error");
});

mongoose.connection.on("disconnected", () => {
  logger.warn("mongo disconnected");
});
