import { ZodError } from "zod";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";
import { isProduction } from "../config/env.js";

export function notFound(req, _res, next) {
  next(AppError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

/**
 * The single place an error becomes a response body.
 *
 * Every client error is `{ error: { code, message, details? } }`. Unexpected
 * errors are logged with the stack and reported as a bare 500 — the client
 * never sees internals.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
export function errorHandler(err, req, res, next) {
  const normalized = normalize(err);

  if (normalized.status >= 500) {
    req.log?.error({ err }, "unhandled error");
  } else {
    req.log?.info({ code: normalized.code, status: normalized.status }, "request rejected");
  }

  const body = {
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };

  if (normalized.details) body.error.details = normalized.details;
  if (!isProduction && normalized.status >= 500) body.error.stack = err.stack;

  res.status(normalized.status).json(body);
}

function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.badRequest("Request validation failed.", fieldErrors(err));
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return AppError.badRequest(
      "Request validation failed.",
      Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message])),
    );
  }

  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Malformed value for "${err.path}".`);
  }

  // Duplicate key on a unique index.
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "field";
    return AppError.conflict(`That ${field} is already taken.`);
  }

  if (err?.type === "entity.parse.failed") {
    return AppError.badRequest("Request body is not valid JSON.");
  }

  return new AppError(500, "internal_error", "Something went wrong.");
}

export function fieldErrors(zodError) {
  const out = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
