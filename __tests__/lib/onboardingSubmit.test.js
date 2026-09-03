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

  it("returns no reminder window when the step was skipped", () => {
    // Skipping is the only way to leave without a window now — completing
    // the step always records one (see OnboardingStep). The old
    // `reminderTiming` fallback went with the question that set it.
    const payload = buildSignupPayload({ email: "a@b.co", password: "x" });
    expect(payload.reminderWindow).toBeNull();
    expect(
      buildSignupPayload({ email: "a@b.co", password: "x", reminderTiming: ["evening"] })
        .reminderWindow,
    ).toBeNull();
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
