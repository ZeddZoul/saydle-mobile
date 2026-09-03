import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import {
  applyWebhookEvent,
  applyTransfer,
  isEntitled,
  isStaleEvent,
} from "../src/services/subscription.service.js";
import { mapStore } from "../src/config/subscription.js";

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

  it("keeps a cancelled subscription entitled until the paid period ends", () => {
    applyWebhookEvent(user, {
      type: "INITIAL_PURCHASE",
      expiration_at_ms: Date.now() + 30 * DAY,
    });

    // "Cancelled" means "will not renew". They paid for the month; they keep
    // the month. Revoking on the cancellation was the bug.
    applyWebhookEvent(user, { type: "CANCELLATION", expiration_at_ms: Date.now() + 20 * DAY });

    expect(user.subscription.status).toBe("active");
    expect(isEntitled(user)).toBe(true);
    expect(user.subscription.expiresAt.getTime()).toBeGreaterThan(Date.now() + 19 * DAY);
  });

  it("revokes on a refund, which is a cancellation whose expiry is already past", () => {
    applyWebhookEvent(user, {
      type: "INITIAL_PURCHASE",
      expiration_at_ms: Date.now() + 30 * DAY,
    });
    applyWebhookEvent(user, { type: "CANCELLATION", expiration_at_ms: Date.now() - 1000 });

    // Same status, different date — and the date is what isEntitled reads.
    expect(user.subscription.status).toBe("active");
    expect(isEntitled(user)).toBe(false);
  });

  it("keeps access through a billing issue's grace period", () => {
    applyWebhookEvent(user, { type: "INITIAL_PURCHASE", expiration_at_ms: Date.now() + DAY });
    applyWebhookEvent(user, {
      type: "BILLING_ISSUE",
      expiration_at_ms: Date.now() - 1000,
      grace_period_expiration_at_ms: Date.now() + 16 * DAY,
    });

    // The store gives a card that failed sixteen days to be fixed. So do we.
    expect(isEntitled(user)).toBe(true);
    expect(user.subscription.expiresAt.getTime()).toBeGreaterThan(Date.now() + 15 * DAY);
  });

  it("falls back to the paid-through date on a billing issue with no grace", () => {
    applyWebhookEvent(user, { type: "BILLING_ISSUE", expiration_at_ms: Date.now() - 1000 });
    expect(isEntitled(user)).toBe(false);
  });

  it("revokes on expiration and on pause", () => {
    for (const type of ["EXPIRATION", "SUBSCRIPTION_PAUSED"]) {
      applyWebhookEvent(user, { type: "RENEWAL", expiration_at_ms: Date.now() + 30 * DAY });
      applyWebhookEvent(user, { type, expiration_at_ms: Date.now() + 30 * DAY });

      // Expired regardless of the date on the event: the store said it is over.
      expect(user.subscription.status).toBe("expired");
      expect(isEntitled(user)).toBe(false);
    }
  });

  it("records where it was bought, and 'other' for anything that is not a store", () => {
    expect(mapStore("APP_STORE")).toBe("app_store");
    expect(mapStore("MAC_APP_STORE")).toBe("app_store");
    expect(mapStore("PLAY_STORE")).toBe("play_store");
    for (const store of ["PROMOTIONAL", "STRIPE", "RC_BILLING", "AMAZON", undefined]) {
      expect(mapStore(store)).toBe("other");
    }

    applyWebhookEvent(user, { type: "INITIAL_PURCHASE", store: "PROMOTIONAL" });
    expect(user.subscription.source).toBe("other");
    // And the model accepts it — an enum the mapping can produce but the
    // schema refuses would fail on save, after the webhook already said 204.
    expect(user.validateSync()).toBeUndefined();
  });

  it("remembers which event it applied last", () => {
    applyWebhookEvent(user, {
      id: "evt_1",
      type: "INITIAL_PURCHASE",
      event_timestamp_ms: 1_700_000_000_000,
      expiration_at_ms: Date.now() + DAY,
    });

    expect(user.subscription.lastEventId).toBe("evt_1");
    expect(user.subscription.lastEventAt.getTime()).toBe(1_700_000_000_000);
    // Bookkeeping, not something the app needs to see.
    expect(user.toJSON().subscription).not.toHaveProperty("lastEventId");
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

describe("isStaleEvent", () => {
  it("flags a redelivery of an event already applied", () => {
    user.subscription.lastEventId = "evt_1";
    expect(isStaleEvent(user, { id: "evt_1", event_timestamp_ms: Date.now() })).toBe("replay");
    expect(isStaleEvent(user, { id: "evt_2", event_timestamp_ms: Date.now() })).toBeNull();
  });

  it("flags an event older than the last one applied", () => {
    user.subscription.lastEventAt = new Date(2_000);
    expect(isStaleEvent(user, { id: "evt_x", event_timestamp_ms: 1_000 })).toBe("out_of_order");
    expect(isStaleEvent(user, { id: "evt_y", event_timestamp_ms: 3_000 })).toBeNull();
  });

  it("treats a missing timestamp as current rather than stale", () => {
    user.subscription.lastEventAt = new Date();
    expect(isStaleEvent(user, { id: "evt_z" })).toBeNull();
  });
});

describe("applyTransfer", () => {
  const transfer = (over = {}) => ({
    id: "evt_transfer",
    type: "TRANSFER",
    store: "APP_STORE",
    event_timestamp_ms: Date.now(),
    ...over,
  });

  it("moves the entitlement from one account to another", async () => {
    const donor = user;
    applyWebhookEvent(donor, {
      type: "INITIAL_PURCHASE",
      product_id: "saydle_annual",
      expiration_at_ms: Date.now() + 300 * DAY,
      store: "APP_STORE",
    });
    const recipient = await User.findById(
      (await registerUser(app, { email: "recipient@example.com" })).user.id,
    );

    const changed = applyTransfer({ from: [donor], to: [recipient] }, transfer());

    expect(changed).toHaveLength(2);
    expect(isEntitled(donor)).toBe(false);
    expect(isEntitled(recipient)).toBe(true);
    // The recipient inherits exactly what was paid for, not a fresh grant.
    expect(recipient.subscription.productId).toBe("saydle_annual");
    expect(recipient.subscription.expiresAt.getTime()).toBe(
      donor.subscription.expiresAt.getTime(),
    );
    expect(recipient.subscription.verifiedAt).not.toBeNull();
  });

  it("grants nothing when the donor is unknown and the event carries no expiry", () => {
    // A transfer from an id we have never seen, with no date to bound it:
    // granting would be an open-ended subscription on nobody's receipt.
    const changed = applyTransfer({ from: [], to: [user] }, transfer());

    expect(changed).toHaveLength(0);
    expect(isEntitled(user)).toBe(false);
  });

  it("trusts an expiry on the event itself when there is no donor to copy", () => {
    applyTransfer({ from: [], to: [user] }, transfer({ expiration_at_ms: Date.now() + DAY }));
    expect(isEntitled(user)).toBe(true);
  });

  it("does nothing for an event that is not a transfer", () => {
    expect(applyTransfer({ from: [user], to: [] }, { type: "RENEWAL" })).toEqual([]);
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

  it("drops a redelivered event rather than applying it twice", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");
    const send = (body) =>
      request(app)
        .post("/api/subscription/webhook")
        .set("Authorization", "Bearer correct-secret")
        .send(body);

    await send(event({ id: "evt_1", event_timestamp_ms: 1_000 })).expect(204);
    // Same id again, now claiming an expiry in the past: a replay must not
    // move anything, however different its body.
    await send(
      event({ id: "evt_1", event_timestamp_ms: 1_000, expiration_at_ms: Date.now() - DAY }),
    ).expect(204);

    const saved = await User.findById(userId);
    expect(isEntitled(saved)).toBe(true);
    vi.unstubAllEnvs();
  });

  it("drops an event that arrives after a newer one", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");
    const send = (body) =>
      request(app)
        .post("/api/subscription/webhook")
        .set("Authorization", "Bearer correct-secret")
        .send(body);

    // The renewal lands first; the expiration it superseded shows up late.
    await send(event({ id: "evt_renew", type: "RENEWAL", event_timestamp_ms: 2_000 })).expect(
      204,
    );
    await send(event({ id: "evt_old", type: "EXPIRATION", event_timestamp_ms: 1_000 })).expect(
      204,
    );

    const saved = await User.findById(userId);
    expect(saved.subscription.status).toBe("active");
    expect(saved.subscription.lastEventId).toBe("evt_renew");
    vi.unstubAllEnvs();
  });

  it("finds the account through an alias when app_user_id is not ours", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");

    // A purchase made before sign-in lives under RevenueCat's anonymous id;
    // once aliased, the event names both.
    const res = await request(app)
      .post("/api/subscription/webhook")
      .set("Authorization", "Bearer correct-secret")
      .send(
        event({
          app_user_id: "$RCAnonymousID:abc123",
          aliases: ["$RCAnonymousID:abc123", userId],
          original_app_user_id: "$RCAnonymousID:abc123",
        }),
      );

    expect(res.status).toBe(204);
    expect(isEntitled(await User.findById(userId))).toBe(true);
    vi.unstubAllEnvs();
  });

  it("moves an entitlement on a TRANSFER event", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "correct-secret");
    const send = (body) =>
      request(app)
        .post("/api/subscription/webhook")
        .set("Authorization", "Bearer correct-secret")
        .send(body);

    const other = (await registerUser(app, { email: "transferee@example.com" })).user.id;
    await send(event({ id: "evt_buy", event_timestamp_ms: 1_000 })).expect(204);

    await send({
      event: {
        id: "evt_move",
        type: "TRANSFER",
        store: "APP_STORE",
        event_timestamp_ms: 2_000,
        transferred_from: [userId],
        transferred_to: [other],
      },
    }).expect(204);

    expect(isEntitled(await User.findById(userId))).toBe(false);
    expect(isEntitled(await User.findById(other))).toBe(true);
    vi.unstubAllEnvs();
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
