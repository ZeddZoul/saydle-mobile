import { t } from "./i18n.js";
/**
 * Three distinct failure modes, kept separate on purpose.
 *
 * The distinction between NetworkError and ApiError is what makes offline work:
 * "the server said no" must clear the session, "I couldn't reach the server"
 * must not. Collapsing them signs the user out every time they open the app on
 * a train.
 */

/** The server was reached and returned a non-2xx response. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message ?? "Request failed.");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True for the field-level validation shape the API returns on 400. */
  get isValidation() {
    return this.status === 400 && Boolean(this.details);
  }
}

/** The server could not be reached at all: offline, DNS, timeout, TLS. */
export class NetworkError extends Error {
  constructor(cause) {
    super(t("errors.network"));
    this.name = "NetworkError";
    this.cause = cause;
    this.isNetwork = true;
  }
}

/**
 * The server was reached and rejected our refresh token. This is the only
 * condition that may sign a user out.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super(t("errors.sessionExpired"));
    this.name = "SessionExpiredError";
  }
}

/** Message safe to show a user for any error, including unexpected ones. */
export function messageFor(error) {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof SessionExpiredError) return error.message;
  if (error instanceof ApiError) return error.message;
  return t("common.somethingWrong");
}
