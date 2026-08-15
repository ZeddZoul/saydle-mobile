import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { runDeletionSweep } from "../src/services/scheduler.service.js";
import { User } from "../src/models/User.js";
import { Tombstone } from "../src/models/Tombstone.js";

const sent = [];

// The mailer is the boundary; what matters is who we tried to write to and when.
vi.mock("../src/services/mailer.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendMail: async (message) => {
      sent.push(message);
      return { id: "test" };
    },
  };
});

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;

async function pendingAccount(email, { purgeAfter, remindedAt = null }) {
  const registered = await registerUser(app, { email });
  const user = await User.findById(registered.user.id);
  user.deletion = { requestedAt: new Date(), purgeAfter, remindedAt };
  await user.save();
  return user;
}

beforeEach(async () => {
  await seed();
  sent.length = 0;
});

/**
 * The clock behind deletion.
 *
 * `purgeDueAccounts` was written and tested when the deletion feature landed,
 * and nothing called it — so every erasure request was recorded and then
 * ignored. These tests exist to make that impossible to reintroduce: the sweep
 * has to actually delete, and it has to warn people first.
 */
describe("the deletion sweep", () => {
  it("deletes an account whose grace period has passed", async () => {
    const user = await pendingAccount("due@example.com", {
      purgeAfter: new Date(Date.now() - DAY),
    });

    const result = await runDeletionSweep();

    expect(result.purged).toBeGreaterThan(0);
    expect(await User.findById(user._id)).toBeNull();
    // The billing record survives; the person does not.
    expect(await Tombstone.countDocuments({ user: user._id })).toBe(1);
  });

  it("leaves an account alone while it still has time", async () => {
    const user = await pendingAccount("waiting@example.com", {
      purgeAfter: new Date(Date.now() + 10 * DAY),
    });

    await runDeletionSweep();

    // Thirty days means thirty days. Deleting early removes the only thing the
    // grace period is for.
    expect(await User.findById(user._id)).not.toBeNull();
  });

  it("warns before deleting, not after", async () => {
    await pendingAccount("soon@example.com", {
      purgeAfter: new Date(Date.now() + 2 * DAY),
    });

    await runDeletionSweep();

    const reminder = sent.find((m) => m.to === "soon@example.com");
    expect(reminder).toBeTruthy();
    expect(reminder.subject).toMatch(/deleted on/i);
  });

  it("warns exactly once, however often it runs", async () => {
    await pendingAccount("once@example.com", {
      purgeAfter: new Date(Date.now() + 2 * DAY),
    });

    await runDeletionSweep();
    await runDeletionSweep();
    await runDeletionSweep();

    expect(sent.filter((m) => m.to === "once@example.com")).toHaveLength(1);
  });

  it("says goodbye before the address is gone, not after", async () => {
    await pendingAccount("bye@example.com", {
      purgeAfter: new Date(Date.now() - DAY),
    });

    await runDeletionSweep();

    // The tombstone keeps a hash of the email and nothing that could address a
    // message — so if this does not go out before the purge, it never can.
    const farewell = sent.find((m) => m.to === "bye@example.com");
    expect(farewell).toBeTruthy();
    expect(farewell.subject).toMatch(/has been deleted/i);
  });

  it("still deletes when the farewell cannot be sent", async () => {
    const mailer = await import("../src/services/mailer.service.js");
    const spy = vi.spyOn(mailer, "sendMail").mockRejectedValue(new Error("smtp down"));

    const user = await pendingAccount("nomail@example.com", {
      purgeAfter: new Date(Date.now() - DAY),
    });

    await runDeletionSweep();

    // An erasure request is not conditional on our ability to send email about
    // it. Failing closed here would quietly keep data someone asked us to drop.
    expect(await User.findById(user._id)).toBeNull();
    spy.mockRestore();
  });

  it("never runs two sweeps at once", async () => {
    await pendingAccount("race@example.com", {
      purgeAfter: new Date(Date.now() - DAY),
    });

    const [first, second] = await Promise.all([runDeletionSweep(), runDeletionSweep()]);

    // One of them must have declined: two workers walking the same accounts is
    // how you get two tombstones for one person.
    expect([first.skipped, second.skipped]).toContain(true);
  });
});
