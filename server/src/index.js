import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();

await connectDb();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "saydle api listening");
});

async function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  // Don't let a hung connection hold the process open forever.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled rejection");
  process.exit(1);
});
