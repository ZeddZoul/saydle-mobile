/**
 * An error the API is willing to describe to a client.
 *
 * Anything thrown that is NOT an AppError is treated as a bug by the error
 * middleware: logged at error level, reported to the client as a bare 500.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.expected = true;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message, details) {
    return new AppError(400, "bad_request", message, details);
  }

  static unauthorized(message = "Not authenticated.") {
    return new AppError(401, "unauthorized", message);
  }

  static forbidden(message = "Not allowed.") {
    return new AppError(403, "forbidden", message);
  }

  static notFound(message = "Not found.") {
    return new AppError(404, "not_found", message);
  }

  static conflict(message, details) {
    return new AppError(409, "conflict", message, details);
  }

  static tooManyRequests(message = "Too many requests.") {
    return new AppError(429, "too_many_requests", message);
  }
}
