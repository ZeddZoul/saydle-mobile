import { AppError } from "../utils/AppError.js";
import { fieldErrors } from "./error.js";

/**
 * Replaces req[source] with the parsed result, so handlers downstream only ever
 * see data that matched the schema — including stripped unknown keys.
 *
 * Express 5 exposes `req.query` (and `req.params`) as lazy getters with no
 * setter, so a plain assignment throws. defineProperty is the supported way to
 * swap in the parsed value.
 */
export const validate =
  (schema, source = "body") =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(AppError.badRequest("Request validation failed.", fieldErrors(result.error)));
    }

    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    next();
  };
