import { env, isProduction, isTest } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { emailFingerprint } from "../lib/pii.js";

/**
 * Outbound email.
 *
 * Provider-agnostic on purpose: set RESEND_API_KEY and mail goes out; leave it
 * unset and messages are logged instead, so the whole reset flow is testable
 * without an account anywhere. Swapping Resend for another provider is one fetch
 * call in `deliver`.
 *
 * Sending is best-effort from the caller's point of view — a mail outage must
 * not turn into a 500 on a reset request, and must never leak whether an
 * address exists.
 */
async function deliver({ to, subject, text }) {
  if (!env.RESEND_API_KEY) {
    // Never the body: it carries a reset or verification code, and a code in
    // a log line is a code in whatever keeps the logs. Production refuses to
    // boot without a key, so this only ever runs on a laptop.
    logger.warn({ to: emailFingerprint(to), subject }, "email not configured — not sent");
    return { delivered: false, reason: "not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
  });

  if (!response.ok) {
    throw new Error(`Mail provider returned ${response.status}`);
  }

  return { delivered: true };
}

export async function sendMail(message) {
  // Tests never hit the network; asserting on the call is the point.
  if (isTest) return { delivered: false, reason: "test" };

  try {
    return await deliver(message);
  } catch (err) {
    logger.error({ err, to: emailFingerprint(message.to) }, "email delivery failed");
    return { delivered: false, reason: "error" };
  }
}

export function sendPasswordResetCode({ to, firstName, code }) {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  return sendMail({
    to,
    subject: "Your Saydle reset code",
    text: [
      greeting,
      "",
      `Your password reset code is ${code}`,
      "",
      "It expires in 15 minutes and can only be used once.",
      "If you didn't ask to reset your password, you can ignore this email —",
      "nothing has changed.",
      "",
      "— Saydle",
    ].join("\n"),
  });
}

export function sendEmailVerificationCode({ to, firstName, code }) {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  return sendMail({
    to,
    subject: "Confirm your email for Saydle",
    text: [
      greeting,
      "",
      `Your confirmation code is ${code}`,
      "",
      "It's good for 24 hours. Confirming your email is what lets us help you",
      "back in if you ever forget your password.",
      "",
      "If you didn't create a Saydle account, you can ignore this email.",
      "",
      "— Saydle",
    ].join("\n"),
  });
}

/** Exposed so production can refuse to boot without a mailer configured. */
export const mailerConfigured = () => Boolean(env.RESEND_API_KEY) || !isProduction;
