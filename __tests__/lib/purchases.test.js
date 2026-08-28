/**
 * The IAP boundary in its two normal states: no native module (Expo Go) and no
 * key (no store listing yet). Both must be quiet non-events, because they are
 * how the app runs for most of its life before launch.
 */

const loadFresh = ({ key, module } = {}) => {
  jest.resetModules();

  jest.doMock("../../lib/config.js", () => ({
    REVENUECAT_KEY: key,
    ENTITLEMENT_ID: "premium",
  }));

  if (module === undefined) {
    // Simulates Expo Go: the JS package resolves, but the native side it needs
    // is absent, so requiring it throws.
    jest.doMock("react-native-purchases", () => {
      throw new Error("Cannot find native module 'RNPurchases'");
    });
  } else {
    jest.doMock("react-native-purchases", () => module);
  }

  // require, not import(): jest's ESM loader is off, and this module has to
  // be re-evaluated per test to pick up a different key/module combination.
  return require("../../lib/purchases.js");
};

const fakePurchases = (over = {}) => ({
  configure: jest.fn(async () => {}),
  getOfferings: jest.fn(async () => ({
    current: { availablePackages: [{ identifier: "monthly" }] },
  })),
  purchasePackage: jest.fn(async () => ({
    customerInfo: { entitlements: { active: { premium: {} } } },
  })),
  restorePurchases: jest.fn(async () => ({ entitlements: { active: { premium: {} } } })),
  ...over,
});

afterEach(() => {
  jest.resetModules();
  jest.dontMock("react-native-purchases");
  jest.dontMock("../../lib/config.js");
});

describe("with no native module (Expo Go)", () => {
  it("reports purchases as unavailable rather than throwing", async () => {
    const purchases = loadFresh({ key: "appl_key" });

    expect(purchases.purchasesAvailable()).toBe(false);
    // Importing must not take down every screen that touches this file.
    await expect(purchases.configurePurchases("u1")).resolves.toEqual({ available: false });
  });

  it("returns an empty offering instead of failing the paywall", async () => {
    const purchases = loadFresh({ key: "appl_key" });

    expect(await purchases.getOffering()).toEqual({ available: false, packages: [] });
  });
});

describe("with no key configured (no store listing yet)", () => {
  it("reports purchases as unavailable even though the module is present", async () => {
    const purchases = loadFresh({ key: undefined, module: fakePurchases() });

    expect(purchases.purchasesAvailable()).toBe(false);
  });

  it("never calls the store", async () => {
    const module = fakePurchases();
    const purchases = loadFresh({ key: undefined, module });

    await purchases.configurePurchases("u1");
    await purchases.getOffering();
    await purchases.purchasePackage({ identifier: "monthly" });

    expect(module.configure).not.toHaveBeenCalled();
    expect(module.purchasePackage).not.toHaveBeenCalled();
  });
});

/**
 * The Test Store key, which is a loaded gun in a release build.
 *
 * A `test_` key makes real-looking purchases with no store behind them, and the
 * RevenueCat SDK refuses one outside development by showing an alert and
 * crashing the app. `EXPO_PUBLIC_*` values are inlined at build time, so a
 * production build cut on a machine whose .env still holds the test key ships
 * that crash — on launch, to everyone. These pin the refusal.
 */
describe("with a Test Store key", () => {
  // `await fn()`, not `return fn()`. Without the await the finally restores
  // __DEV__ the moment the callback hits its first await — so the second half of
  // every test below would run as a dev build and pass for the wrong reason.
  const withDev = async (dev, fn) => {
    const was = global.__DEV__;
    global.__DEV__ = dev;
    try {
      return await fn();
    } finally {
      global.__DEV__ = was;
    }
  };

  it("is usable in development, where that is the whole point", async () => {
    await withDev(true, async () => {
      const module = fakePurchases();
      const purchases = loadFresh({ key: "test_abc123", module });

      expect(purchases.purchasesAvailable()).toBe(true);
      await purchases.configurePurchases("u1");
      expect(module.configure).toHaveBeenCalledWith({
        apiKey: "test_abc123",
        appUserID: "u1",
      });
    });
  });

  it("is refused in a release build rather than crashing the app", async () => {
    await withDev(false, async () => {
      const module = fakePurchases();
      const purchases = loadFresh({ key: "test_abc123", module });

      expect(purchases.purchasesAvailable()).toBe(false);
      await expect(purchases.configurePurchases("u1")).resolves.toEqual({
        available: false,
      });
      // Never handed to the SDK: reaching configure() is the crash.
      expect(module.configure).not.toHaveBeenCalled();
    });
  });

  it("degrades to the trial path instead of a dead paywall", async () => {
    await withDev(false, async () => {
      const purchases = loadFresh({ key: "test_abc123", module: fakePurchases() });

      // Same shape as "no key at all" — the state the paywall already handles.
      expect(await purchases.getOffering()).toEqual({ available: false, packages: [] });
      expect(await purchases.purchasePackage({})).toEqual({ available: false });
      expect(await purchases.restorePurchases()).toEqual({ available: false });
    });
  });

  it("leaves a real store key alone in a release build", async () => {
    await withDev(false, async () => {
      const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

      // The guard must key off the `test_` prefix, not off being a release.
      expect(purchases.purchasesAvailable()).toBe(true);
    });
  });
});

describe("fully configured", () => {
  it("identifies the account by our own user id", async () => {
    const module = fakePurchases();
    const purchases = loadFresh({ key: "appl_key", module });

    await purchases.configurePurchases("user-123");

    // RevenueCat's anonymous ids change on reinstall; an entitlement we can't
    // match back to an account is one someone paid for and lost.
    expect(module.configure).toHaveBeenCalledWith({
      apiKey: "appl_key",
      appUserID: "user-123",
    });
  });

  it("returns the current offering's packages", async () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

    const offering = await purchases.getOffering();
    expect(offering).toEqual({ available: true, packages: [{ identifier: "monthly" }] });
  });

  it("reports a completed purchase", async () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

    expect(await purchases.purchasePackage({ identifier: "monthly" })).toMatchObject({
      purchased: true,
      entitled: true,
    });
  });

  it("treats cancelling as a plain outcome, not an error", async () => {
    const cancelled = Object.assign(new Error("cancelled"), { userCancelled: true });
    const purchases = loadFresh({
      key: "appl_key",
      module: fakePurchases({
        purchasePackage: jest.fn(async () => {
          throw cancelled;
        }),
      }),
    });

    // Saying no is the commonest outcome of showing a paywall; an alert would
    // be aimed at someone who just declined.
    expect(await purchases.purchasePackage({})).toEqual({
      available: true,
      purchased: false,
      cancelled: true,
    });
  });

  it("reports a real failure without throwing at the caller", async () => {
    const purchases = loadFresh({
      key: "appl_key",
      module: fakePurchases({
        purchasePackage: jest.fn(async () => {
          throw new Error("store unreachable");
        }),
      }),
    });

    const result = await purchases.purchasePackage({});
    expect(result.purchased).toBe(false);
    expect(result.cancelled).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
  });

  it("restores what someone already paid for", async () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

    // Apple requires this wherever a subscription is sold.
    expect(await purchases.restorePurchases()).toEqual({ available: true, entitled: true });
  });

  it("survives an offering call that fails", async () => {
    const purchases = loadFresh({
      key: "appl_key",
      module: fakePurchases({
        getOfferings: jest.fn(async () => {
          throw new Error("network");
        }),
      }),
    });

    const offering = await purchases.getOffering();
    expect(offering.packages).toEqual([]);
  });
});
