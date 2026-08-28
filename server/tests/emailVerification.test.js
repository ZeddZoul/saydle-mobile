import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { registerUser } from "./helpers.js";
import { seed } from "../migrations/seed.js";
import { User } from "../src/models/User.js";
import { EmailVerificationToken } from "../src/models/EmailVerificationToken.js";
import {
  generateCode,
  issueVerificationCode,
  consumeVerificationCode,
} from "../src/services/emailVerification.service.js";

const app = createApp();

/** The code only exists in plaintext at issue time, so tests re-issue to read it. */
async function freshCode(user) {
  return issueVerificationCode(user);
}

let user;
let auth;

beforeEach(async () => {
  // The curated bank has to exist for the "still usable" check to mean anything.
  await seed();
  const registered = await registerUser(app, { email: "verify@example.com" });
  auth = registered.auth;
  user = await User.findById(registered.user.id);
});

describe("generateCode", () => {
  it("is always six digits, leading zeros included", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("registration", () => {
  it("issues a code without waiting to be asked", async () => {
    const pending = await EmailVerificationToken.countDocuments({ user: user._id });
    expect(pending).toBe(1);
  });

  it("leaves the account unverified but fully usable", async () => {
    expect(user.emailVerifiedAt).toBeNull();

    // Nothing is gated on verification — the affirmations someone just signed up
    // for must not sit behind an inbox.
    const feed = await request(app).get("/api/affirmations/today").set("Authorization", auth);
    expect(feed.status).toBe(200);
  });

  it("never stores the code itself", async () => {
    const token = await EmailVerificationToken.findOne({ user: user._id });

    expect(token.codeHash).toMatch(/^[a-f\d]{64}$/);
    expect(JSON.stringify(token.toJSON())).not.toMatch(/\b\d{6}\b/);
  });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies with the right code and reports it on the user", async () => {
    const code = await freshCode(user);

    const res = await request(app)
      .post("/api/auth/verify-email")
      .set("Authorization", auth)
      .send({ code });

    expect(res.status).toBe(200);
    expect(res.body.user.emailVerifiedAt).toBeTruthy();

    const saved = await User.findById(user._id);
    expect(saved.emailVerifiedAt).toBeTruthy();
  });

  it("rejects a wrong code", async () => {
    await freshCode(user);

    const res = await request(app)
      .post("/api/auth/verify-email")
      .set("Authorization", auth)
      .send({ code: "000000" });

    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).emailVerifiedAt).toBeNull();
  });

  it("rejects anything that isn't six digits before touching the database", async () => {
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      const res = await request(app)
        .post("/api/auth/verify-email")
        .set("Authorization", auth)
        .send({ code });

      expect(res.status).toBe(400);
    }
  });

  it("requires a session", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ code: "123456" });
    expect(res.status).toBe(401);
  });

  it("burns the code after five wrong guesses", async () => {
    const code = await freshCode(user);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post("/api/auth/verify-email")
        .set("Authorization", auth)
        .send({ code: "000000" });
    }

    // Attempts, not the six digits, are the security boundary.
    const res = await request(app)
      .post("/api/auth/verify-email")
      .set("Authorization", auth)
      .send({ code });

    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).emailVerifiedAt).toBeNull();
  });

  it("cannot reuse a code that already worked", async () => {
    const code = await freshCode(user);

    await request(app).post("/api/auth/verify-email").set("Authorization", auth).send({ code });

    const token = await EmailVerificationToken.findOne({ user: user._id });
    expect(token.usedAt).not.toBeNull();
  });

  it("treats a second verification as a success, not an error", async () => {
    const code = await freshCode(user);
    await request(app).post("/api/auth/verify-email").set("Authorization", auth).send({ code });

    // A stale tap on an already-verified account is nothing to explain.
    const again = await request(app)
      .post("/api/auth/verify-email")
      .set("Authorization", auth)
      .send({ code: "000000" });

    expect(again.status).toBe(200);
    expect(again.body.user.emailVerifiedAt).toBeTruthy();
  });
});

describe("POST /api/auth/verify-email/send", () => {
  it("supersedes the previous code so only one is live", async () => {
    const first = await freshCode(user);

    await request(app)
      .post("/api/auth/verify-email/send")
      .set("Authorization", auth)
      .expect(204);

    // Otherwise every "resend" leaves another guessable code in the inbox.
    const live = await EmailVerificationToken.countDocuments({
      user: user._id,
      usedAt: null,
    });
    expect(live).toBe(1);

    const res = await request(app)
      .post("/api/auth/verify-email")
      .set("Authorization", auth)
      .send({ code: first });
    expect(res.status).toBe(400);
  });

  it("stays quiet, and sends nothing, once the address is verified", async () => {
    const code = await freshCode(user);
    await request(app).post("/api/auth/verify-email").set("Authorization", auth).send({ code });

    const before = await EmailVerificationToken.countDocuments({ user: user._id });
    await request(app)
      .post("/api/auth/verify-email/send")
      .set("Authorization", auth)
      .expect(204);

    expect(await EmailVerificationToken.countDocuments({ user: user._id })).toBe(before);
  });

  it("requires a session", async () => {
    await request(app).post("/api/auth/verify-email/send").expect(401);
  });
});

describe("consumeVerificationCode", () => {
  it("refuses a code issued to a different address", async () => {
    const code = await freshCode(user);

    // The address was mistyped and corrected; the code already in flight went to
    // someone else's inbox and must not verify this one.
    user.email = "corrected@example.com";
    await user.save();

    expect(await consumeVerificationCode(user, code)).toBe(false);
    expect((await User.findById(user._id)).emailVerifiedAt).toBeNull();
  });

  it("refuses an expired code", async () => {
    const code = await freshCode(user);

    await EmailVerificationToken.updateOne(
      { user: user._id, usedAt: null },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    expect(await consumeVerificationCode(user, code)).toBe(false);
  });

  it("counts a miss against the live code, so guessing exhausts it", async () => {
    await freshCode(user);

    await consumeVerificationCode(user, "000000");

    const token = await EmailVerificationToken.findOne({ user: user._id, usedAt: null });
    expect(token.attempts).toBe(1);
  });

  it("cannot be satisfied by a password-reset code", async () => {
    // Separate collections precisely so a code issued for one purpose is never
    // presented for the other.
    const { issueResetCode } = await import("../src/services/passwordReset.service.js");
    const resetCode = await issueResetCode(user._id);

    expect(await consumeVerificationCode(user, resetCode)).toBe(false);
  });
});
