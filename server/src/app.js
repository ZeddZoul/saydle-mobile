import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { logger } from "./lib/logger.js";
import { corsOrigins, isTest } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import {
  affirmationRouter,
  categoryRouter,
  preferencesRouter,
} from "./routes/affirmation.routes.js";
import { libraryRouter } from "./routes/library.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { streakRouter } from "./routes/streak.routes.js";
import { subscriptionRouter } from "./routes/subscription.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  // Railway and friends terminate TLS upstream; without this the rate limiter
  // sees every request as coming from the proxy.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      // No configured origins means same-origin/native-only, which is the
      // normal case for the Expo client — it sends no Origin header.
      origin: corsOrigins.length > 0 ? corsOrigins : false,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  if (!isTest) {
    app.use(pinoHttp({ logger, genReqId: () => crypto.randomUUID() }));
  }

  app.get("/healthz", (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? "ok" : "degraded", db: dbUp });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/affirmations", affirmationRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/library", libraryRouter);
  app.use("/api/preferences", preferencesRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/streak", streakRouter);
  app.use("/api/subscription", subscriptionRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
