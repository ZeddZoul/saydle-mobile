import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { perUserLimiter } from "../src/middleware/rateLimit.js";

/**
 * The per-account limiter, exercised on its own.
 *
 * The routes wire it up disabled under test — the suite registers dozens of
 * accounts and must not throttle itself — so this builds a tiny app with the
 * limiter switched on and a stubbed `req.user`, and checks the one property
 * that matters: the bucket is the account, not the address.
 */
function appWith(limiter) {
  const app = express();
  // Every request comes from the same "IP" (supertest), which is the point.
  app.use((req, _res, next) => {
    req.user = { _id: req.get("x-user") };
    next();
  });
  app.post("/spend", limiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("perUserLimiter", () => {
  it("limits one account without touching another", async () => {
    const app = appWith(perUserLimiter({ max: 2, enabled: true }));

    await request(app).post("/spend").set("x-user", "a").expect(200);
    await request(app).post("/spend").set("x-user", "a").expect(200);
    const third = await request(app).post("/spend").set("x-user", "a");

    expect(third.status).toBe(429);
    // Same error shape as everything else, so the client's parser copes.
    expect(third.body.error.code).toBe("too_many_requests");

    // A different account behind the same address is a different bucket.
    await request(app).post("/spend").set("x-user", "b").expect(200);
  });

  it("is a no-op when disabled, which is how the suite runs", async () => {
    const app = appWith(perUserLimiter({ max: 1, enabled: false }));

    for (let i = 0; i < 5; i += 1) {
      await request(app).post("/spend").set("x-user", "a").expect(200);
    }
  });

  it("advertises the limit in standard headers", async () => {
    const app = appWith(perUserLimiter({ max: 3, enabled: true }));
    const res = await request(app).post("/spend").set("x-user", "a");
    expect(res.headers["ratelimit"]).toMatch(/limit=3/);
  });
});

describe("the limited routes", () => {
  it("are all behind a session, so the bucket always has an owner", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    for (const [method, path] of [
      ["post", "/api/voice/session"],
      ["post", "/api/library/warm"],
      ["patch", "/api/preferences"],
      ["patch", "/api/profile"],
      ["post", "/api/affirmations/custom"],
    ]) {
      const res = await request(app)[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});
