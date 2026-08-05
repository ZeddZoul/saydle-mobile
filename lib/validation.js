import { t } from "./i18n.js";
/**
 * Client-side form validation, mirroring the server's zod rules (see
 * server/src/validators/auth.schema.js).
 *
 * This is a UX layer, not a security layer — it gives instant feedback and
 * avoids a pointless round-trip for an obviously-bad email. The server remains
 * the source of truth and its field errors still surface if anything slips past.
 */

// Deliberately permissive: "has something@something.something with no spaces".
// Stricter regexes reject valid addresses; the server does the authoritative check.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Exported so the onboarding password step gates on the same number. */
export const PASSWORD_MIN = 8;

export function validateEmail(value) {
  const email = (value ?? "").trim();
  if (!email) return t("validation.emailRequired");
  if (!EMAIL.test(email)) return t("validation.emailInvalid");
  return undefined;
}

/** Returns a { field: message } map; empty object means valid. */
export function validateLogin(form) {
  const errors = {};
  const email = validateEmail(form.email);
  if (email) errors.email = email;
  if (!form.password) errors.password = t("validation.passwordRequired");
  return errors;
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;
