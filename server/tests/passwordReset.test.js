import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import { RefreshToken } from "../src/models/RefreshToken.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import {
  generateCode,
  issueResetCode,
  consumeResetCode,
} from "../src/services/passwordReset.service.js";

const app = createApp();

beforeEach(async () => {
  await seed();
});

const userIdFor = async (email) => (await User.findOne({ email }))._id;

describe("generateCode", () => {
  it("is always six digits", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("issueResetCode", () => {
  it("supersedes an earlier code, so only the newest works", async () => {
    const { user } = await registerUser(app);
    const id = await userIdFor(user.email);

    const first = await issueResetCode(id);
    const second = await issueResetCode(id);

    expect(await consumeResetCode(id, first)).toBe(false);
    expect(await consumeResetCode(id, second)).toBe(true);
  });

  it("stores only a hash of the code", async () => {
    const { user } = await registerUser(app);
    const id = await userIdFor(user.email);

    const code = await issueResetCode(id);
    const stored = await PasswordResetToken.findOne({ user: id });

    expect(stored.codeHash).not.toContain(code);
    expect(stored.codeHash).toHaveLength(64); // sha256 hex
  });
});

describe("consumeResetCode", () => {
  it("can only be used once", async () => {
    const { user } = await registerUser(app);
    const id = await userIdFor(user.email);
    const code = await issueResetCode(id);

    expect(await consumeResetCode(id, code)).toBe(true);
    expect(await consumeResetCode(id, code)).toBe(false);
  });

  it("rejects an expired code", async () => {
    const { user } = await registerUser(app);
    const id = await userIdFor(user.email);
    const code = await issueResetCode(id);

    await PasswordResetToken.updateOne(
      { user: id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    expect(await consumeResetCode(id, code)).toBe(false);
  });

  it("burns the code after repeated wrong guesses", async () => {
    // Six digits is only a million options, so attempts — not secrecy — are the
    // real boundary.
    const { user } = await registerUser(app);
    const id = await userIdFor(user.email);
    const code = await issueResetCode(id);

    for (let i = 0; i < 5; i += 1) {
      await consumeResetCode(id, "000000" === code ? "111111" : "000000");
    }

    // Even the correct code is now dead.
    expect(await consumeResetCode(id, code)).toBe(false);
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("answers the same for a known and an unknown address", async () => {
    const { user } = await registerUser(app);

    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    // Any difference here is an account-enumeration oracle.
    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
    expect(known.body).toEqual(unknown.body);
  });

  it("creates a code for a real user", async () => {
    const { user } = await registerUser(app);

    await request(app).post("/api/auth/forgot-password").send({ email: user.email });

    expect(await PasswordResetToken.countDocuments({ user: await userIdFor(user.email) })).toBe(1);
  });

  it("creates nothing for an unknown address", async () => {
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(await PasswordResetToken.countDocuments()).toBe(0);
  });

  it("rejects a malformed email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/reset-password", () => {
  const NEW_PASSWORD = "a brand new passphrase";

  it("changes the password and lets the user sign in with it", async () => {
    const { user } = await registerUser(app);
    const code = await issueResetCode(await userIdFor(user.email));

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code, password: NEW_PASSWORD });

    expect(reset.status).toBe(204);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: NEW_PASSWORD });

    expect(login.status).toBe(200);
  });

  it("stops the old password working", async () => {
    const { user } = await registerUser(app);
    const code = await issueResetCode(await userIdFor(user.email));

    await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code, password: NEW_PASSWORD });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "correct horse battery" });

    expect(login.status).toBe(401);
  });

  it("revokes every existing session", async () => {
    // If the reset happened because someone else was in the account, leaving
    // their refresh token alive would defeat the point.
    const { user, refreshToken } = await registerUser(app);
    const id = await userIdFor(user.email);
    const code = await issueResetCode(id);

    await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code, password: NEW_PASSWORD });

    const stillLive = await RefreshToken.countDocuments({ user: id, revokedAt: null });
    expect(stillLive).toBe(0);

    const refresh = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it("rejects a wrong code", async () => {
    const { user } = await registerUser(app);
    await issueResetCode(await userIdFor(user.email));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code: "000000", password: NEW_PASSWORD });

    expect(res.status).toBe(400);
  });

  it("answers identically for an unknown address and a wrong code", async () => {
    const { user } = await registerUser(app);
    await issueResetCode(await userIdFor(user.email));

    const wrongCode = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code: "000000", password: NEW_PASSWORD });
    const unknownEmail = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "nobody@example.com", code: "000000", password: NEW_PASSWORD });

    expect(wrongCode.status).toBe(unknownEmail.status);
    expect(wrongCode.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it("rejects a code that isn't six digits before looking anything up", async () => {
    const { user } = await registerUser(app);

    for (const code of ["12345", "1234567", "abcdef", ""]) {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ email: user.email, code, password: NEW_PASSWORD });
      expect(res.status, code).toBe(400);
    }
  });

  it("enforces the password minimum on the new password", async () => {
    const { user } = await registerUser(app);
    const code = await issueResetCode(await userIdFor(user.email));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code, password: "short" });

    expect(res.status).toBe(400);
  });

  it("cannot be replayed with the same code", async () => {
    const { user } = await registerUser(app);
    const code = await issueResetCode(await userIdFor(user.email));

    await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code, password: NEW_PASSWORD });

    const replay = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: user.email, code, password: "another passphrase entirely" });

    expect(replay.status).toBe(400);
  });
});
