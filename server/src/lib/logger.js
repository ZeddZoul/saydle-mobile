import pino from "pino";
import { env, isProduction, isTest } from "../config/env.js";

// Anything listed here is replaced with [Redacted] before it reaches a log sink.
// Add to this list whenever a new secret-bearing field enters a request or response.
const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.headers["x-forwarded-for"]',
    'req.headers["x-real-ip"]',
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

/**
 * What a request line carries, and nothing more.
 *
 * pino-http's defaults log every header and the remote address, which is a
 * client IP and user agent per request — personal data, retained for as long
 * as the log sink keeps it. The id is enough to find a request again; method
 * and path are enough to know what it was.
 */
export const serializers = {
  req: (req) => ({ id: req.id, method: req.method, url: req.url }),
  res: (res) => ({ statusCode: res.statusCode }),
};

export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact,
  transport: isProduction
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
});
