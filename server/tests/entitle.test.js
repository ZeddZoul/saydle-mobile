import { describe, it, expect } from "vitest";
import {
  grantPromotionalEntitlement,
  revokePromotionalEntitlement,
  isEntitled,
  serializeSubscription,
  applyWebhookEvent,
} from "../src/services/subscription.service.js";

/** The shape the model gives us, without needing a database for pure functions. */
const blank = () => ({
  subscription: {
    status: "none",
    productId: null,
    expiresAt: null,
    source: null,
    verifiedAt: null,
  },
});

describe("grantPromotionalEntitlement", () => {
  it("entitles an account that has never paid", () => {
    const user = blank();
    expect(isEntitled(user)).toBe(false);

    grantPromotionalEntitlement(user);

    expect(isEntitled(user)).toBe(true);
    expect(user.subscription.source).toBe("promotional");
  });

  it("never sets verifiedAt, because no store was asked", () => {
    // The whole invariant: applyWebhookEvent is the only path allowed to stamp
    // this, because it is the only one behind a receipt a store has checked.
    const user = blank();
    grantPromotionalEntitlement(user);

    expect(user.subscription.verifiedAt).toBeNull();
    expect(serializeSubscription(user).verified).toBe(false);
  });

  it("always writes an expiry, so a comp cannot become a lifetime by accident", () => {
    // isEntitled treats a null expiry as lifetime, so leaving it null would
    // hand out permanent access with no record of intent.
    const now = new Date("2026-01-01T00:00:00Z");
    const user = blank();

    grantPromotionalEntitlement(user, { days: 30, now });

    expect(user.subscription.expiresAt).toEqual(new Date("2026-01-31T00:00:00Z"));
  });

  it("defaults to a year", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const user = blank();

    grantPromotionalEntitlement(user, { now });

    expect(user.subscription.expiresAt).toEqual(new Date("2027-01-01T00:00:00Z"));
  });

  it("claims no product, since none was bought", () => {
    const user = blank();
    user.subscription.productId = "saydle_premium_annual";

    grantPromotionalEntitlement(user);

    expect(user.subscription.productId).toBeNull();
  });

  it("lapses on its own once the expiry passes", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const user = blank();

    grantPromotionalEntitlement(user, { days: 7, now });

    expect(isEntitled(user, new Date("2026-01-05T00:00:00Z"))).toBe(true);
    expect(isEntitled(user, new Date("2026-01-09T00:00:00Z"))).toBe(false);
  });
});

describe("revokePromotionalEntitlement", () => {
  it("ends access immediately", () => {
    const user = blank();
    grantPromotionalEntitlement(user);

    revokePromotionalEntitlement(user);

    expect(isEntitled(user)).toBe(false);
    expect(user.subscription.status).toBe("expired");
  });

  it("keeps the record rather than erasing it", () => {
    const user = blank();
    grantPromotionalEntitlement(user);
    revokePromotionalEntitlement(user);

    expect(user.subscription.source).toBe("promotional");
  });
});

describe("a real purchase afterwards", () => {
  it("overwrites the comp and is verified, unlike the comp", () => {
    // A reviewer's comped account that later actually subscribes must end up
    // looking like any other paying account, not stuck as promotional.
    const user = blank();
    grantPromotionalEntitlement(user);

    applyWebhookEvent(user, {
      type: "INITIAL_PURCHASE",
      product_id: "saydle_premium_annual",
      store: "APP_STORE",
      expiration_at_ms: new Date("2027-06-01T00:00:00Z").getTime(),
    });

    expect(user.subscription.source).toBe("app_store");
    expect(user.subscription.productId).toBe("saydle_premium_annual");
    expect(serializeSubscription(user).verified).toBe(true);
  });
});

describe("events that must not end access", () => {
  const YEAR_END = new Date("2027-01-01T00:00:00Z");

  it("keeps a cancelled subscription until the term it paid for runs out", () => {
    // Auto-renew off is not the same as access off. Someone who cancels on day
    // two of an annual subscription has bought 363 more days.
    const user = blank();
    applyWebhookEvent(user, {
      type: "INITIAL_PURCHASE",
      store: "APP_STORE",
      expiration_at_ms: YEAR_END.getTime(),
    });

    applyWebhookEvent(user, {
      type: "CANCELLATION",
      store: "APP_STORE",
      expiration_at_ms: YEAR_END.getTime(),
    });

    expect(isEntitled(user, new Date("2026-03-01T00:00:00Z"))).toBe(true);
    expect(isEntitled(user, new Date("2027-02-01T00:00:00Z"))).toBe(false);
  });

  it("ends access on a refund, which arrives as a cancellation with a past expiry", () => {
    // RevenueCat reports refunds as CANCELLATION too, carrying an expiry of
    // now. Trusting the date rather than the event type gets both right without
    // a special case.
    const user = blank();
    applyWebhookEvent(user, {
      type: "CANCELLATION",
      store: "APP_STORE",
      expiration_at_ms: new Date("2026-01-01T00:00:00Z").getTime(),
    });

    expect(isEntitled(user, new Date("2026-01-02T00:00:00Z"))).toBe(false);
  });

  it("keeps access through the billing grace period", () => {
    // The point of the grace period: Apple is retrying the card and still
    // counts them a subscriber. Expiring them here bills and locks out at once.
    const user = blank();
    applyWebhookEvent(user, {
      type: "BILLING_ISSUE",
      store: "APP_STORE",
      expiration_at_ms: new Date("2026-06-01T00:00:00Z").getTime(),
      grace_period_expiration_at_ms: new Date("2026-06-17T00:00:00Z").getTime(),
    });

    // Original expiry has passed; the grace expiry has not.
    expect(isEntitled(user, new Date("2026-06-10T00:00:00Z"))).toBe(true);
    expect(isEntitled(user, new Date("2026-06-20T00:00:00Z"))).toBe(false);
  });

  it("still expires when the term genuinely ends", () => {
    const user = blank();
    applyWebhookEvent(user, {
      type: "EXPIRATION",
      store: "APP_STORE",
      expiration_at_ms: new Date("2026-06-01T00:00:00Z").getTime(),
    });

    expect(isEntitled(user, new Date("2026-06-02T00:00:00Z"))).toBe(false);
    expect(user.subscription.status).toBe("expired");
  });
});
