/**
 * The legal URLs and the support address, which App Review checks by tapping.
 *
 * `EXPO_PUBLIC_*` is inlined at build time, so the defaults are what a build
 * with nothing set ships — they have to be real, and an override has to win.
 */
const loadFresh = (env = {}) => {
  jest.resetModules();
  const was = {};
  for (const key of [
    "EXPO_PUBLIC_PRIVACY_URL",
    "EXPO_PUBLIC_TERMS_URL",
    "EXPO_PUBLIC_SUPPORT_EMAIL",
  ]) {
    was[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return require("../../lib/legal.js");
  } finally {
    for (const [key, value] of Object.entries(was)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe("lib/legal", () => {
  it("defaults to the production documents and inbox", () => {
    const legal = loadFresh();

    expect(legal.PRIVACY_URL).toBe("https://saydle.app/privacy");
    expect(legal.TERMS_URL).toBe("https://saydle.app/terms");
    expect(legal.SUPPORT_EMAIL).toBe("support@saydle.app");
  });

  it("lets the environment point a build elsewhere", () => {
    const legal = loadFresh({
      EXPO_PUBLIC_PRIVACY_URL: "https://staging.saydle.app/privacy",
      EXPO_PUBLIC_TERMS_URL: "https://staging.saydle.app/terms",
      EXPO_PUBLIC_SUPPORT_EMAIL: "hello@staging.saydle.app",
    });

    expect(legal.PRIVACY_URL).toBe("https://staging.saydle.app/privacy");
    expect(legal.TERMS_URL).toBe("https://staging.saydle.app/terms");
    expect(legal.SUPPORT_EMAIL).toBe("hello@staging.saydle.app");
  });

  it("treats an empty variable as unset rather than shipping a blank link", () => {
    const legal = loadFresh({ EXPO_PUBLIC_PRIVACY_URL: "" });
    expect(legal.PRIVACY_URL).toBe("https://saydle.app/privacy");
  });

  it("builds a mailto with the subject encoded", () => {
    const legal = loadFresh();
    expect(legal.supportMailto("Saydle support")).toBe(
      "mailto:support@saydle.app?subject=Saydle%20support",
    );
  });
});
