import { User } from "../models/User.js";
import { logger } from "../lib/logger.js";
import { sendMail } from "./mailer.service.js";
import { GRACE_DAYS, REMINDER_DAYS_BEFORE } from "../config/deletion.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const on = (date) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const greet = (firstName) => (firstName ? `Hi ${firstName},` : "Hi,");

/**
 * Sent the moment someone asks to be deleted.
 *
 * The whole point of a grace period is that it can be changed its mind about,
 * so the one thing this must carry is how to cancel: sign back in. Sent from
 * the request, not the sweep — a confirmation that arrives an hour later has
 * already failed at its job.
 */
export function sendDeletionScheduled({ to, firstName, purgeAfter }) {
  return sendMail({
    to,
    subject: "Your Saydle account is scheduled for deletion",
    text: [
      greet(firstName),
      "",
      `You asked us to delete your Saydle account. Nothing has been removed yet.`,
      `Everything will be deleted on ${on(purgeAfter)} — ${GRACE_DAYS} days from now.`,
      "",
      "Changed your mind? Just sign in again before then and the deletion is",
      "cancelled. You don't need to contact anyone.",
      "",
      "This does not cancel a paid subscription. Subscriptions belong to your",
      "App Store or Play Store account and have to be cancelled there.",
      "",
      "— Saydle",
    ].join("\n"),
  });
}

/**
 * The last chance, a few days out.
 *
 * Someone who asked to be deleted a month ago may well have forgotten, and the
 * deletion is irreversible. `remindedAt` is stamped so this goes exactly once,
 * however many times the sweep runs.
 */
export function sendDeletionReminder({ to, firstName, purgeAfter }) {
  return sendMail({
    to,
    subject: `Your Saydle account is deleted on ${on(purgeAfter)}`,
    text: [
      greet(firstName),
      "",
      `A while ago you asked us to delete your Saydle account. That happens on`,
      `${on(purgeAfter)}, and once it does none of it can be recovered —`,
      "your affirmations, the ones you kept, your streak, all of it.",
      "",
      "If you'd rather keep it, sign in before then and the deletion is",
      "cancelled. If you still want it gone, do nothing at all.",
      "",
      "— Saydle",
    ].join("\n"),
  });
}

/**
 * Sent immediately before the data goes, never after.
 *
 * There is no "after": the tombstone keeps a one-way hash of the email for the
 * billing record and nothing that could address a message. Once the sweep has
 * run there is no way left to reach this person, which is the point.
 */
export function sendDeletionComplete({ to, firstName }) {
  return sendMail({
    to,
    subject: "Your Saydle account has been deleted",
    text: [
      greet(firstName),
      "",
      "Your Saydle account and everything in it have now been deleted.",
      "",
      "We keep one thing: a record that a subscription existed, with no name and",
      "no email attached, because tax law requires it. It cannot be traced back",
      "to you and it disappears on its own.",
      "",
      "You're welcome back any time — it would be a fresh start, not a",
      "restoration, because there is nothing left to restore.",
      "",
      "— Saydle",
    ].join("\n"),
  });
}

/**
 * The reminder pass.
 *
 * Everyone inside the reminder window who has not been told yet. `remindedAt`
 * is written per account as its mail goes out, so a crash halfway through
 * resends nothing on the next tick.
 */
export async function sendDeletionReminders({ now = new Date(), limit = 200 } = {}) {
  const window = new Date(now.getTime() + REMINDER_DAYS_BEFORE * DAY_MS);

  const due = await User.find({
    "deletion.purgeAfter": { $ne: null, $lte: window, $gt: now },
    "deletion.remindedAt": null,
  })
    .limit(limit)
    .select("+email");

  let sent = 0;

  for (const user of due) {
    try {
      await sendDeletionReminder({
        to: user.email,
        firstName: user.firstName,
        purgeAfter: user.deletion.purgeAfter,
      });
      user.deletion.remindedAt = now;
      await user.save();
      sent += 1;
    } catch (err) {
      // One bad address must not stop the rest. Unstamped, so it retries.
      logger.error({ err, userId: user.id }, "deletion reminder failed");
    }
  }

  return sent;
}

/**
 * The farewell pass, run just before the purge.
 *
 * Separated from the purge itself so a mail failure can never stop an erasure:
 * someone who asked to be deleted gets deleted whether or not we manage to tell
 * them. The reverse — deleting first — is impossible anyway, since the address
 * is gone by then.
 */
export async function sendDeletionFarewells({ now = new Date(), limit = 100 } = {}) {
  const due = await User.find({
    "deletion.purgeAfter": { $ne: null, $lte: now },
  })
    .limit(limit)
    .select("+email");

  let sent = 0;

  for (const user of due) {
    try {
      await sendDeletionComplete({ to: user.email, firstName: user.firstName });
      sent += 1;
    } catch (err) {
      logger.error({ err, userId: user.id }, "deletion farewell failed");
    }
  }

  return sent;
}
