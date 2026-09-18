import { buildSignupPayload } from "../../lib/onboardingSubmit.js";

describe("buildSignupPayload", () => {
  it("splits answers into account, preferences, and profile", () => {
    const payload = buildSignupPayload({
      callName: "Ada",
      email: "ada@example.com",
      password: "correct horse",
      tone: "gentle",
      values: ["growth", "peace"],
      ageBand: "25-34",
      feelingCauses: ["work"],
      goal: "finish my thesis",
      limitingBelief: "I'm not enough",
    });

    expect(payload.account).toEqual({
      firstName: "Ada",
      lastName: "",
      email: "ada@example.com",
      password: "correct horse",
    });
    expect(payload.preferences.tone).toBe("gentle");
    expect(payload.preferences.focus).toContain("finish my thesis");
    expect(payload.preferences.focus).toContain("I'm not enough");
    expect(payload.profile.values).toEqual(["growth", "peace"]);
    expect(payload.profile.ageBand).toBe("25-34");
    expect(payload.profile.feelingCauses).toEqual(["work"]);
  });

  it("drops empty answers from the profile and falls back the name", () => {
    const payload = buildSignupPayload({
      callName: "   ",
      email: "a@b.co",
      password: "x",
      supportAreas: [],
      zodiac: null,
      values: undefined,
    });

    expect(payload.profile).toEqual({});
    expect(payload.account.firstName).toBe("Friend");
  });

  it("omits preferences entirely when no tone or free text is given", () => {
    const payload = buildSignupPayload({ email: "a@b.co", password: "x" });
    expect(payload.preferences).toEqual({});
  });

  it("never leaks credential, name, or tone keys into the profile", () => {
    const payload = buildSignupPayload({
      callName: "Ada",
      email: "a@b.co",
      password: "secret",
      tone: "gentle",
      innerCritic: "harsh",
    });

    expect(payload.profile).not.toHaveProperty("email");
    expect(payload.profile).not.toHaveProperty("password");
    expect(payload.profile).not.toHaveProperty("callName");
    expect(payload.profile).not.toHaveProperty("tone");
    expect(payload.profile.innerCritic).toBe("harsh");
  });

  it("stores each free-text answer as its own field, not just a joined blob", () => {
    // The prompt needs to know *what* each answer is; joining them threw that away.
    const payload = buildSignupPayload({
      email: "a@b.co",
      password: "x",
      goal: "finish my thesis",
      weighing: "my father is unwell",
      feelingCausesOther: "my religion and work life balance",
      employmentStatusOther: "freelancing between contracts",
      beliefsOther: "quietly spiritual",
      aspiration: "someone who rests without guilt",
      limitingBelief: "that I am behind",
    });

    expect(payload.profile).toMatchObject({
      goal: "finish my thesis",
      weighing: "my father is unwell",
      feelingCausesOther: "my religion and work life balance",
      employmentStatusOther: "freelancing between contracts",
      beliefsOther: "quietly spiritual",
      aspiration: "someone who rests without guilt",
      limitingBelief: "that I am behind",
    });
  });

  it("passes the chosen reminder window through, leaving enabling to the caller", () => {
    const payload = buildSignupPayload({
      email: "a@b.co",
      password: "x",
      reminders: { count: 5, start: "08:00", end: "20:00" },
    });

    expect(payload.reminderWindow).toEqual({ count: 5, start: "08:00", end: "20:00" });
    // Not enabled here — that depends on the OS permission result.
    expect(payload.preferences.reminders).toBeUndefined();
  });

  it("falls back to the older timing answers when no window was set", () => {
    const payload = buildSignupPayload({
      email: "a@b.co",
      password: "x",
      reminderTiming: ["evening", "first-thing"],
    });

    expect(payload.reminderWindow).toMatchObject({ count: 2, start: "07:30", end: "18:30" });
  });

  it("returns no reminder window when nothing was chosen", () => {
    const payload = buildSignupPayload({ email: "a@b.co", password: "x" });
    expect(payload.reminderWindow).toBeNull();
  });

  it("caps the composed focus text", () => {
    const payload = buildSignupPayload({
      email: "a@b.co",
      password: "x",
      goal: "x".repeat(400),
      weighing: "y".repeat(400),
    });
    expect(payload.preferences.focus.length).toBeLessThanOrEqual(500);
  });
});

/**
 * What happens between the store saying yes and the app opening.
 *
 * The version before this navigated to /dashboard the instant StoreKit
 * returned, and the route guard bounced the buyer back to the paywall because
 * the webhook had not landed yet. It went untested because it lived inline in
 * the onboarding screen, which is the reason it is a function now.
 */
describe("routeAfterPurchase", () => {
  const { routeAfterPurchase } = require("../../lib/onboardingSubmit.js");
  const { pollUntil } = require("../../lib/settle.js");

  const run = (overrides = {}) =>
    routeAfterPurchase({
      purchase: async () => true,
      readSubscription: async () => ({ entitled: true }),
      refreshUser: async () => {},
      poll: pollUntil,
      delays: [0, 0, 0],
      ...overrides,
    });

  it("opens the app once the server agrees the account is entitled", async () => {
    expect(await run()).toBe("/dashboard");
  });

  it("waits for the server rather than trusting the store", async () => {
    // The whole bug: the first read is genuinely too early, because a sale goes
    // store → RevenueCat → our webhook before it is true here.
    const readSubscription = jest
      .fn()
      .mockResolvedValueOnce({ entitled: false })
      .mockResolvedValueOnce({ entitled: false })
      .mockResolvedValueOnce({ entitled: true });

    expect(await run({ readSubscription })).toBe("/dashboard");
    expect(readSubscription).toHaveBeenCalledTimes(3);
  });

  it("re-reads the session, which is what the route guard actually consults", async () => {
    const refreshUser = jest.fn(async () => {});

    await run({ refreshUser });

    expect(refreshUser).toHaveBeenCalled();
  });

  it("hands a slow webhook to the locked screen instead of holding a spinner", async () => {
    // Eighty seconds is a measured figure, not a hypothetical. Nobody watches a
    // spinner for that, so the screen says the payment landed and keeps asking.
    const destination = await run({ readSubscription: async () => ({ entitled: false }) });

    expect(destination).toBe("/locked?settling=1");
  });

  it("does not claim a sale the session cannot see", async () => {
    const refreshUser = jest.fn(async () => {});

    await run({ readSubscription: async () => ({ entitled: false }), refreshUser });

    // Refreshing on a read that never went entitled would replace a good user
    // object with an identical one and imply something happened.
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it("sends someone who did not buy to the paywall, not through the dashboard", async () => {
    const readSubscription = jest.fn();

    const destination = await run({ purchase: async () => false, readSubscription });

    // Via /dashboard it would be one frame of a screen they cannot have, and
    // the server is not worth asking about a purchase that never happened.
    expect(destination).toBe("/locked");
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it("only says it is confirming once there is something to confirm", async () => {
    const onConfirming = jest.fn();

    await run({ purchase: async () => false, onConfirming });
    expect(onConfirming).not.toHaveBeenCalled();

    await run({ onConfirming });
    expect(onConfirming).toHaveBeenCalledTimes(1);
  });
});
