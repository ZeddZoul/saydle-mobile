import pino from "pino";
import { env, isProduction, isTest } from "../config/env.js";

// Anything listed here is replaced with [Redacted] before it reaches a log sink.
// Add to this list whenever a new secret-bearing field enters a request or response.
const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.body.password",
    "req.body.currentPassword",
    "req.body.newPassword",
    "req.body.refreshToken",
    "res.headers['set-cookie']",
    "password",
    "passwordHash",
    "refreshToken",
    "accessToken",
    "*.password",
    "*.passwordHash",
    "*.refreshToken",
    "*.accessToken",
  ],
  censor: "[Redacted]",
};

export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact,
  transport: isProduction
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
});
