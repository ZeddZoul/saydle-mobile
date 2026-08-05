import { z } from "zod";

// Capped well above any real password: argon2 cost scales with input length,
// so an unbounded field is a cheap way to burn server CPU.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password must be at most 200 characters.");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);

const name = (label) =>
  z.string().trim().min(1, `${label} is required.`).max(60);

export const registerSchema = z
  .object({
    firstName: name("First name"),
    // Optional — the onboarding flow collects a display name only.
    lastName: z.string().trim().max(60).optional().default(""),
    email,
    password,
    timezone: z.string().max(64).optional(),
    locale: z.string().max(10).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, "Password is required.").max(200),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, "Refresh token is required."),
  })
  .strict();

export const logoutSchema = refreshSchema;

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z
  .object({
    email,
    // Exactly six digits — a length mismatch is rejected before any lookup.
    code: z.string().regex(/^\d{6}$/, "Enter the six-digit code from your email."),
    password,
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    // Same shape as a reset code, and just as deliberately checked before any
    // database lookup happens.
    code: z.string().regex(/^\d{6}$/, "Enter the six-digit code from your email."),
  })
  .strict();
