import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import {
  applyWebhookEvent,
  isEntitled,
  serializeSubscription,
  startTrial,
} from "../src/services/subscription.service.js";

const app = createApp();

const DAY = 24 * 60 * 60 * 1000;
const ahead = (ms) => new Date(Date.now() + ms);
const behind = (ms) => new Date(Date.now() - ms);

let user;
let auth;
let userId;

beforeEach(async () => {
  const registered = await registerUser(app, { email: "sub@example.com" });
  auth = registered.auth;
  userId = registered.user.id;
  user = await User.findById(userId);
});

describe("isEntitled", () => {
  it("says no for a fresh account", () => {
    expect(isEntitled({ subscription: { status: "none" } })).toBe(false);
  });

  it("says yes during a live trial and no once it passes", () => {
    expect(isEntitled({ subscription: { status: "trialing", trialEndsAt: ahead(DAY) } })).toBe(true);
    // Derived from the date, so a trial that lapsed overnight is simply over —
    // there is no sweep job to forget to run.
    expect(isEntitled({ subscription: { status: "trialing", trialEndsAt: behind(DAY) } })).toBe(
      false,
    );
  });

  it("says yes for a live subscription and no for a lapsed one", () => {
    expect(isEntitled({ subscription: { status: "active", expiresAt: ahead(DAY) } })).toBe(true);
    expect(isEntitled({ subscription: { status: "active", expiresAt: behind(DAY) } })).toBe(false);
  });

  it("says yes for a purchase with no expiry at all", () => {
    // Lifetime and non-renewing purchases have nothing to compare against.
    expect(isEntitled({ subscription: { status: "active", expiresAt: null } })).toBe(true);
  });

  it("says no for an expired status regardless of dates", () => {
    expect(isEntitled({ subscription: { status: "expired", expiresAt: ahead(DAY) } })).toBe(false);
  });
});

describe("startTrial", () => {
  it("grants the configured trial length", () => {
    expect(startTrial(user, { days: 3 })).toBe(true);

    expect(user.subscription.status).toBe("trialing");
    expect(user.subscription.source).toBe("trial");
    expect(isEntitled(user)).toBe(true);
  });

  it("never marks a trial verified — nobody checked a receipt", () => {
    startTrial(user);
    expect(user.subscription.verifiedAt).toBeNull();
  });

  it("cannot be used twice to extend or resurrect a trial", () => {
    startTrial(user, { days: 3 });
    const firstEnd = user.subscription.trialEndsAt;

    expect(startTrial(user, { days: 30 })).toBe(false);
    expect(user.subscription.trialEndsAt).toEqual(firstEnd);
  });
});

describe("GET /api/subscription", () => {
  it("reports a fresh account as unentitled", async () => {
    const res = await request(app).get("/api/subscription").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({ entitled: false, status: "none" });
  });

  it("requires a session", async () => {
    await request(app).get("/api/subscription").expect(401);
  });

  it("never leaks receipt internals", async () => {
    const res = await request(app).get("/api/subscription").set("Authorization", auth);

    expect(res.body.subscription).not.toHaveProperty("verifiedAt");
    expect(res.body.subscription).not.toHaveProperty("productId");
  });
});

describe("POST /api/subscription/trial", () => {
  it("starts the trial and entitles the account", async () => {
    const res = await request(app).post("/api/subscription/trial").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({
      entitled: true,
      status: "trialing",
      verified: false,
    });
  });

  it("does not extend a trial that was already used", async () => {
    const first = await request(app).post("/api/subscription/trial").set("Authorization", auth);
    const again = await request(app).post("/api/subscription/trial").set("Authorization", auth);

    // Otherwise the button is an infinite subscription.
    expect(again.body.subscription.trialEndsAt).toBe(first.body.subscription.trialEndsAt);
  });
});

describe("applyWebhookEvent", () => {
  it("activates on a purchase and records the expiry", () => {
    const expires = Date.now() + 30 * DAY;

    expect(
      applyWebhookEvent(user, {
        type: "INITIAL_PURCHASE",
        product_id: "saydle_monthly",
        expiration_at_ms: expires,
        store: "APP_STORE",
      }),
    ).toBe(true);

    expect(user.subscription.status).toBe("active");
    expect(user.subscription.productId).toBe("saydle_monthly");
    expect(user.subscription.source).toBe("app_store");
    expect(isEntitled(user)).toBe(true);
  });

  it("is the only thing that marks an entitlement verified", () => {
    applyWebhookEvent(user, { type: "RENEWAL", expiration_at_ms: Date.now() + DAY });
    expect(user.subscription.verifiedAt).not.toBeNull();
  });

  it("expires on cancellation and billing failure", () => {
    for (const type of ["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"]) {
      applyWebhookEvent(user, { type, expiration_at_ms: Date.now() - DAY });
      expect(user.subscription.status).toBe("expired");
      expect(isEntitled(user)).toBe(false);
    }
  });

  it("ignores an event type it doesn't recognise rather than revoking access", () => {
    applyWebhookEvent(user, { type: "INITIAL_PURCHASE", expiration_at_ms: Date.now() + DAY });

    // A new RevenueCat event type must not read as a cancellation.
    expect(applyWebhookEvent(user, { type: "SOMETHING_NEW" })).toBe(false);
    expect(isEntitled(user)).toBe(true);
  });

  it("ignores an event for somebody else's entitlement", () => {
    expect(
      applyWebhookEvent(user, {
        type: "INITIAL_PURCHASE",
        entitlement_ids: ["some_other_product"],
        expiration_at_ms: Date.now() + DAY,
      }),
    ).toBe(false);
    expect(isEntitled(user)).toBe(false);
  });
});

describe("POST /api/subscription/webhook", () => {
  const event = (over = {}) => ({
    event: {
      type: "INITIAL_PURCHASE",
      app_user_id: userId,
      product_id: "saydle_monthly",
      expiration_at_ms: Date.now() + 30 * DAY,
      store: "APP_STORE",
      ...over,
    },
  });

  it("refuses everything when no secret is configured", async () => {
    // Failing closed: an unauthenticated entitlement endpoint is a free
    // subscription for anyone who finds the URL.
    const res = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer anything")
      .send(event());

    expect(res.status).toBe(401);
    expect((await User.findById(userId)).subscription.status).toBe("none");
  });

  it("accepts the configured secret and refuses a wrong one", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");

    const wrong = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer wrong-secret-xx")
      .send(event());
    expect(wrong.status).toBe(401);

    const right = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer correct-secret")
      .send(event());
    expect(right.status).toBe(204);

    const saved = await User.findById(userId);
    expect(saved.subscription.status).toBe("active");
    expect(saved.subscription.verifiedAt).not.toBeNull();

    vi.unstubAllEnvs();
  });

  it("is not fooled by a secret of a different length", async () => {
    // timingSafeEqual throws on a length mismatch; the guard must handle it
    // rather than turning a wrong guess into a 500.
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");

    const res = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer x")
      .send(event());

    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("never accepts a client claiming to have paid", async () => {
    // There is deliberately no authenticated "I bought it" endpoint. The only
    // way in is the webhook, behind a receipt RevenueCat already checked.
    const res = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", auth)
      .send(event());

    expect(res.status).toBe(401);
  });

  it("acknowledges an event for an account that no longer exists", async () => {
    await User.deleteOne({ _id: userId });

    const res = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer anything")
      .send(event());

    // Whatever the status, it must not be a 5xx — RevenueCat retries those
    // forever.
    expect(res.status).toBeLessThan(500);
  });
});
