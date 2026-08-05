import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { RefreshToken } from "../src/models/RefreshToken.js";

const app = createApp();

const validUser = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  password: "correct horse battery",
};

const registerUser = (overrides = {}) =>
  request(app)
    .post("/api/auth/register")
    .send({ ...validUser, ...overrides });

describe("POST /api/auth/register", () => {
  it("creates an account and returns a token pair", async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: "ada@example.com",
      firstName: "Ada",
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it("never returns the password hash", async () => {
    const res = await registerUser();

    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("$argon2");
  });

  it("lowercases and trims the email", async () => {
    const res = await registerUser({ email: "  ADA@Example.COM " });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("ada@example.com");
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser();
    const res = await registerUser({ firstName: "Someone" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
  });

  it("rejects a short password with per-field details", async () => {
    const res = await registerUser({ password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("password");
  });

  it("rejects a malformed email", async () => {
    const res = await registerUser({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("email");
  });

  it("strips unknown fields rather than trusting them", async () => {
    const res = await registerUser({ emailVerifiedAt: new Date().toISOString() });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await registerUser();
  });

  it("returns a token pair for correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("rejects a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: "wrong password entirely" });

    expect(res.status).toBe(401);
  });

  it("gives the same answer for an unknown email as a wrong password", async () => {
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: validUser.password });

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: "wrong password entirely" });

    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });
});

describe("GET /api/auth/me", () => {
  it("rejects a request with no token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("authorization", "Bearer not.a.real.token");

    expect(res.status).toBe(401);
  });

  it("returns the caller for a valid token", async () => {
    const { body } = await registerUser();

    const res = await request(app)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validUser.email);
  });
});

describe("POST /api/auth/refresh", () => {
  it("exchanges a refresh token for a new pair", async () => {
    const { body } = await registerUser();

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(body.refreshToken);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "nonsense" });

    expect(res.status).toBe(401);
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const { body } = await registerUser();

    const first = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: body.refreshToken });
    expect(first.status).toBe(200);

    // Replay the token that was already rotated away.
    const replay = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: body.refreshToken });
    expect(replay.status).toBe(401);

    // The successor issued to the legitimate client is now dead too.
    const successor = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: first.body.refreshToken });
    expect(successor.status).toBe(401);

    const live = await RefreshToken.countDocuments({ revokedAt: null });
    expect(live).toBe(0);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the token and is safe to call twice", async () => {
    const { body } = await registerUser();

    expect((await request(app).post("/api/auth/logout").send({ refreshToken: body.refreshToken })).status).toBe(204);
    expect((await request(app).post("/api/auth/logout").send({ refreshToken: body.refreshToken })).status).toBe(204);

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: body.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/auth/me", () => {
  it("deletes the account and kills every session", async () => {
    const { body } = await registerUser();

    const res = await request(app)
      .delete("/api/auth/me")
      .set("authorization", `Bearer ${body.accessToken}`);
    expect(res.status).toBe(204);

    // The access token is still cryptographically valid but the account is gone.
    const after = await request(app)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${body.accessToken}`);
    expect(after.status).toBe(401);

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: body.refreshToken });
    expect(refreshed.status).toBe(401);
  });
});

describe("infrastructure", () => {
  it("reports health", async () => {
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: true });
  });

  it("404s an unknown route in the standard error shape", async () => {
    const res = await request(app).get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("rejects malformed JSON with a 400, not a crash", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("content-type", "application/json")
      .send("{ not json");

    expect(res.status).toBe(400);
  });
});
