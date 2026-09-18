import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import { applyWebhookEvent, isEntitled } from "../src/services/subscription.service.js";

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

  it("says yes for a live subscription and no for a lapsed one", () => {
    expect(isEntitled({ subscription: { status: "active", expiresAt: ahead(DAY) } })).toBe(
      true,
    );
    expect(isEntitled({ subscription: { status: "active", expiresAt: behind(DAY) } })).toBe(
      false,
    );
  });

  it("says yes for a purchase with no expiry at all", () => {
    // Lifetime and non-renewing purchases have nothing to compare against.
    expect(isEntitled({ subscription: { status: "active", expiresAt: null } })).toBe(true);
  });

  it("says no for an expired status regardless of dates", () => {
    expect(isEntitled({ subscription: { status: "expired", expiresAt: ahead(DAY) } })).toBe(
      false,
    );
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

  it("ends access once the paid term has run out, whatever the event type", () => {
    // The date decides, not the label. Every one of these carries an expiry in
    // the past, so none of them is entitled regardless of how it is reported.
    for (const type of ["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"]) {
      applyWebhookEvent(user, { type, expiration_at_ms: Date.now() - DAY });
      expect(isEntitled(user)).toBe(false);
    }
  });

  it("marks expired only when the term really ended", () => {
    // CANCELLATION is auto-renew switched off and BILLING_ISSUE is a payment
    // being retried. Neither is the end of a subscription, and writing
    // "expired" for them is what would take away a paid-for year on day two.
    applyWebhookEvent(user, { type: "EXPIRATION", expiration_at_ms: Date.now() - DAY });
    expect(user.subscription.status).toBe("expired");

    for (const type of ["CANCELLATION", "BILLING_ISSUE"]) {
      applyWebhookEvent(user, { type, expiration_at_ms: Date.now() + DAY });
      expect(user.subscription.status).toBe("active");
      expect(isEntitled(user)).toBe(true);
    }
  });

  it("ignores an event type it doesn't recognise rather than revoking access", () => {
    applyWebhookEvent(user, { type: "INITIAL_PURCHASE", expiration_at_ms: Date.now() + DAY });

    // A new RevenueCat event type must not read as a cancellation.
    expect(applyWebhookEvent(user, { type: "SOMETHING_NEW" })).toBe(false);
    expect(isEntitled(user)).toBe(true);
  });

  /**
   * A Play Store pause is scheduled, not immediate.
   *
   * It begins at the end of the period already paid for, and the event carries
   * that date. Marking it expired on arrival took away days someone had bought,
   * which is the same mistake as reading CANCELLATION as the end of access.
   */
  it("keeps a paused subscription until the period already paid for runs out", () => {
    const pauseStarts = Date.now() + 10 * DAY;

    applyWebhookEvent(user, {
      type: "SUBSCRIPTION_PAUSED",
      store: "PLAY_STORE",
      expiration_at_ms: pauseStarts,
    });

    expect(isEntitled(user, new Date(Date.now() + 5 * DAY))).toBe(true);
    // And it ends on its own when the pause begins — no follow-up event needed,
    // because entitlement is read from the date rather than from the status.
    expect(isEntitled(user, new Date(Date.now() + 11 * DAY))).toBe(false);
  });

  /**
   * The failure that would have been invisible.
   *
   * `isEntitled` reads an active subscription with no expiry as a lifetime one,
   * which is right for a one-off purchase and catastrophic for anything else.
   * A RENEWAL that arrived malformed used to null the expiry and hand out
   * permanent access, with nothing logged anywhere.
   */
  it("does not turn a missing expiry into a lifetime subscription", () => {
    const expiresAt = new Date(Date.now() + 30 * DAY);
    applyWebhookEvent(user, {
      type: "INITIAL_PURCHASE",
      store: "APP_STORE",
      expiration_at_ms: expiresAt.getTime(),
    });

    applyWebhookEvent(user, { type: "RENEWAL", store: "APP_STORE" });

    expect(user.subscription.expiresAt).toEqual(expiresAt);
    expect(isEntitled(user, new Date(Date.now() + 40 * DAY))).toBe(false);
  });

  it("still lets a one-off purchase be a lifetime one", () => {
    // The one event where no expiry genuinely means forever.
    applyWebhookEvent(user, { type: "NON_RENEWING_PURCHASE", store: "APP_STORE" });

    expect(user.subscription.expiresAt).toBeNull();
    expect(isEntitled(user, new Date(Date.now() + 3650 * DAY))).toBe(true);
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

  /**
   * TRANSFER names the accounts in `transferred_from` / `transferred_to`, not
   * in `app_user_id`, so it arrived with none and was answered 400 — which
   * RevenueCat reads as a delivery failure and retries forever, for an event
   * we were never going to act on.
   */
  it("acknowledges an event that names no app_user_id instead of retrying forever", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");

    const res = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer correct-secret")
      .send({
        event: {
          type: "TRANSFER",
          store: "APP_STORE",
          transferred_from: ["someone-else"],
          transferred_to: [userId],
        },
      });

    expect(res.status).toBe(204);
  });

  it("grants nothing on a transfer, because acting on a guess could lock out a payer", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");

    await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer correct-secret")
      .send({
        event: { type: "TRANSFER", store: "APP_STORE", transferred_to: [userId] },
      });

    // Entitlement is server-truth and arrives with a real purchase event. A
    // transfer carries no product and no expiry, so there is nothing here that
    // could honestly be granted.
    expect((await User.findById(userId)).subscription.status).toBe("none");
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

/**
 * There is no trial any more — premium is the only way in.
 *
 * Worth an assertion rather than an absence: a route that quietly came back,
 * or a client still calling one, would hand out entitlement for free and
 * nothing else here would notice.
 */
describe("the hard paywall", () => {
  it("has no trial endpoint to call", async () => {
    const { auth } = await registerUser(app, { email: "notrial@example.com" });

    const res = await request(app).post("/api/subscription/trial").set("authorization", auth);

    expect(res.status).toBe(404);
  });

  it("leaves a new account unentitled, with nothing it can do about it but pay", async () => {
    const { auth } = await registerUser(app, { email: "fresh@example.com" });

    const res = await request(app).get("/api/subscription").set("authorization", auth);

    expect(res.body.subscription).toMatchObject({ entitled: false, status: "none" });
    expect(res.body.subscription).not.toHaveProperty("trialEndsAt");
  });
});

/**
 * The sample line is captioned "here's one Saydle wrote for you", on the one
 * screen where someone is deciding whether to pay. It may only ever hold a line
 * the model actually wrote for that account.
 */
describe("the paywall sample is proof or nothing", () => {
  it("is null on an account the model never wrote for", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    user.sampleLine = null;
    await user.save();

    const res = await request(app).get("/api/subscription").set("Authorization", me.auth);

    // Not a curated line standing in for one. The screen shows the promises
    // instead; a bank line under that caption would be a false claim.
    expect(res.body.subscription.sampleLine).toBeNull();
  });

  it("never substitutes a curated line", async () => {
    // There was a fallbackSample() that returned the first curated line "so the
    // card is never empty". Nothing called it, and it is gone.
    const mod = await import("../src/services/sampleLine.service.js");
    expect(mod.fallbackSample).toBeUndefined();
  });
});
