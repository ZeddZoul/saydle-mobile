import { nextRoute } from "../../lib/routeGuard.js";

/**
 * The guard had no test of any kind, and that is how a paywall that could not
 * sell anything reached a device: the failure looked exactly like the app
 * working. Every branch is pinned here.
 */

const at = (...segments) => ({ segments });
const signedOut = { isSignedIn: false, entitled: false };
const unpaid = { isSignedIn: true, entitled: false };
const paid = { isSignedIn: true, entitled: true };

describe("signed out", () => {
  it("is turned away from the app", () => {
    expect(nextRoute({ ...signedOut, ...at("(dashboard)", "dashboard") })).toBe("/login");
  });

  it("is left alone on the landing screen and in auth", () => {
    expect(nextRoute({ ...signedOut, ...at() })).toBeNull();
    expect(nextRoute({ ...signedOut, ...at("(auth)", "login") })).toBeNull();
  });

  it("is left alone inside onboarding, which IS the sign-up", () => {
    expect(nextRoute({ ...signedOut, ...at("onboarding") })).toBeNull();
  });
});

describe("signed in but not paid", () => {
  it.each([
    ["dashboard"],
    ["stream"],
    ["practice"],
    ["favorites"],
    ["library"],
    ["saved"],
    ["my-words"],
    ["themes"],
    // Gated too: everything it offers an unpaid account is on /locked, and the
    // half it offers a subscriber ("Manage or cancel") is meaningless here.
    ["billing"],
    // Gated too: sign out and delete moved onto /locked precisely so this
    // could close. Leaving it open would be a settings screen with no app.
    ["profile"],
  ])("cannot reach %s", (screen) => {
    expect(nextRoute({ ...unpaid, ...at("(dashboard)", screen) })).toBe("/locked");
  });

  it("can reach the locked screen, which is the whole app for them", () => {
    expect(nextRoute({ ...unpaid, ...at("(dashboard)", "locked") })).toBeNull();
  });

  it("is sent to the paywall from the landing screen rather than into the app", () => {
    expect(nextRoute({ ...unpaid, ...at() })).toBe("/locked");
  });

  it("is left alone inside onboarding, so the purchase is not interrupted", () => {
    // The account exists, and is unentitled, from the moment signUp returns —
    // which is before grantAccess has even opened the store sheet.
    expect(nextRoute({ ...unpaid, ...at("onboarding") })).toBeNull();
  });
});

describe("signed in and paid", () => {
  it("is let into the app", () => {
    expect(nextRoute({ ...paid, ...at("(dashboard)", "dashboard") })).toBeNull();
    expect(nextRoute({ ...paid, ...at("(dashboard)", "practice") })).toBeNull();
  });

  it("is moved out of the landing screen into the app", () => {
    expect(nextRoute({ ...paid, ...at() })).toBe("/dashboard");
  });

  it("is not bounced off billing, which is where they manage or cancel", () => {
    expect(nextRoute({ ...paid, ...at("(dashboard)", "billing") })).toBeNull();
  });

  /**
   * The bug this replaced, which shipped green.
   *
   * The locked screen does not navigate — it polls, and the most it can do is
   * sync entitlement into the session. So when a webhook landed while someone
   * watched the "payment received" banner, `entitled` flipped true, the guard
   * answered null, and the payer sat looking at the plan buttons with no way
   * through but relaunching the app. The same dead end caught Restore and the
   * foreground refresh, since all three end in the same place.
   */
  it("is let into the app the moment entitlement lands on the paywall screen", () => {
    expect(nextRoute({ ...paid, ...at("(dashboard)", "locked") })).toBe("/dashboard");
  });

  it("is put back on the paywall if entitlement lapses", () => {
    // The other direction still holds, which is what makes the redirect safe.
    expect(
      nextRoute({ isSignedIn: true, entitled: false, ...at("(dashboard)", "locked") }),
    ).toBeNull();
  });
});

describe("the shape of entitlement", () => {
  it("treats a missing session as unpaid rather than throwing", () => {
    expect(nextRoute({ isSignedIn: true, entitled: undefined, segments: [] })).toBe("/locked");
  });

  it("does not crash on an empty segment list", () => {
    expect(() => nextRoute({ isSignedIn: true, entitled: true })).not.toThrow();
  });
});
