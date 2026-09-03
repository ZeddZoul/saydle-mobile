import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { registerUser } from "./helpers.js";
import { RefreshToken } from "../src/models/RefreshToken.js";
import { env } from "../src/config/env.js";

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;

/**
 * The parts of a session that have a lifetime beyond one token.
 */
describe("a refresh family", () => {
  it("cannot rotate past its maximum age", async () => {
    const { refreshToken } = await registerUser(app);

    // Wind the family's birth back past the ceiling. Each token is still well
    // inside its own thirty days — that is precisely the case the ceiling is
    // for: a chain of valid tokens that has been renewing itself since spring.
    await RefreshToken.updateMany(
      {},
      {
        $set: {
          familyIssuedAt: new Date(Date.now() - (env.REFRESH_FAMILY_MAX_DAYS + 1) * DAY),
        },
      },
    );

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });

    expect(res.status).toBe(401);
    // The whole family is closed, not just this token.
    const tokens = await RefreshToken.find({});
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("carries its birth date through every rotation", async () => {
    const { refreshToken } = await registerUser(app);
    const [first] = await RefreshToken.find({});

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);

    const successor = await RefreshToken.findOne({ rotatedAt: null });
    expect(successor.familyIssuedAt.getTime()).toBe(first.familyIssuedAt.getTime());
  });

  it("treats a row from before the field existed as born when it was created", async () => {
    const { refreshToken } = await registerUser(app);
    await RefreshToken.updateMany({}, { $set: { familyIssuedAt: null } });

    // Recent createdAt: still allowed.
    await request(app).post("/api/auth/refresh").send({ refreshToken }).expect(200);
  });

  it("stores nothing about the device", async () => {
    await registerUser(app);
    const [token] = await RefreshToken.find({}).lean();

    // The user agent was recorded and never read — a fingerprint kept for
    // nothing. It is not a field any more.
    expect(token).not.toHaveProperty("userAgent");
  });
});

describe("an access token", () => {
  it("is rejected when signed with an algorithm other than the pinned one", async () => {
    const { user } = await registerUser(app);

    // HS512 with the right key: a verifier that trusts the header's `alg`
    // accepts it; ours pins HS256 and does not.
    const forged = jwt.sign({ sub: user.id }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS512",
      issuer: "saydle",
      audience: "saydle-app",
      expiresIn: "5m",
    });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});
